import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueCardRecord, CatalogueSetRecord } from "@/lib/storage/postgres";

/**
 * The collection's sets, read out of the copy instead of over HTTP.
 *
 * Two things are worth pinning here and they pull in opposite directions. The copy must answer
 * without touching the network at all, because that is the whole point; and it must answer null,
 * not an empty set, for anything it does not hold, because an empty set catalogue is a set whose
 * every card is unmatched, which is the failure this replaced.
 */

const listCatalogueSets = vi.fn();
const catalogueCardsBySets = vi.fn();

vi.mock("@/lib/storage/postgres", () => ({
  listCatalogueSets: (...a: unknown[]) => listCatalogueSets(...a),
  catalogueCardsBySets: (...a: unknown[]) => catalogueCardsBySets(...a),
}));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));
vi.mock("./ptcg", () => ({ ptcgLogo: async () => null }));

const { forgetCopiedSets, mirrorSetCatalogue } = await import("./set-catalogue-mirror");

const set = (over: Partial<CatalogueSetRecord> = {}): CatalogueSetRecord => ({
  id: "sv03.5",
  name: "151",
  series: "Scarlet & Violet",
  release_date: "2023/09/22",
  logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo.webp",
  symbol: null,
  abbreviation: "MEW",
  total: 207,
  printed_total: 165,
  ...over,
});

const card = (over: Partial<CatalogueCardRecord> = {}): CatalogueCardRecord =>
  ({
    id: "sv03.5-001",
    set_id: "sv03.5",
    local_id: "001",
    name: "Bulbasaur",
    set_name: "151",
    series: "Scarlet & Violet",
    release_date: "2023/09/22",
    rarity: "Common",
    types: ["Grass"],
    image: "https://assets.tcgdex.net/en/sv/sv03.5/001",
    ...over,
  }) as CatalogueCardRecord;

beforeEach(() => {
  forgetCopiedSets();
  listCatalogueSets.mockResolvedValue([set()]);
  catalogueCardsBySets.mockResolvedValue([[card()]]);
  // Nothing here may reach the network. A call is a failure, not a slow test.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("the copy asked the network");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("mirrorSetCatalogue", () => {
  it("answers a set the copy holds, without asking anyone", async () => {
    const cat = await mirrorSetCatalogue("151");
    expect(cat?.byNumber["001"]).toMatchObject({ id: "sv03.5-001", name: "Bulbasaur" });
    expect(cat?.officialName).toBe("151");
    expect(cat?.code).toBe("MEW");
    expect(cat?.total).toBe(207);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("matches a number the way the collection writes it, not the way the catalogue does", async () => {
    // "1" and "001" are the same card; the collection has both spellings in it.
    const cat = await mirrorSetCatalogue("151");
    expect(cat?.byNumber["1"]?.id).toBe("sv03.5-001");
  });

  it("says nothing for a set the copy has never seen, so the caller asks TCGdex", async () => {
    expect(await mirrorSetCatalogue("Pitch Black")).toBeNull();
  });

  it("says nothing when the copy has the set and none of its cards", async () => {
    // The set row is written before its cards, so this is a real moment, and answering with an
    // empty index would file every card of the set as unmatched for the day it is cached.
    catalogueCardsBySets.mockResolvedValue([[]]);
    expect(await mirrorSetCatalogue("151")).toBeNull();
  });

  it("says nothing before the first night has run", async () => {
    listCatalogueSets.mockResolvedValue([]);
    expect(await mirrorSetCatalogue("151")).toBeNull();
  });

  it("keeps a gallery's cards behind the parent set's own", async () => {
    // "TG01" folds to a bare "1" on the second pass, which the parent's own card 001 already
    // claims on the first. The parent must keep it, or a collector who wrote down "1" gets a
    // Trainer Gallery card's picture and price.
    listCatalogueSets.mockResolvedValue([
      set({ id: "swsh10", name: "Astral Radiance", abbreviation: "ASR" }),
      set({ id: "swsh10tg", name: "Astral Radiance Trainer Gallery", abbreviation: "ASR" }),
    ]);
    catalogueCardsBySets.mockResolvedValue([
      [card({ id: "swsh10-001", set_id: "swsh10", local_id: "001", name: "Hisuian Voltorb" })],
      [card({ id: "swsh10tg-TG01", set_id: "swsh10tg", local_id: "TG01", name: "Sneasler" })],
    ]);

    const cat = await mirrorSetCatalogue("Astral Radiance");
    expect(cat?.byNumber["1"]?.id).toBe("swsh10-001");
    expect(cat?.byNumber["001"]?.id).toBe("swsh10-001");
    expect(cat?.byNumber["tg01"]?.id).toBe("swsh10tg-TG01");
  });

  it("reads the copy's sets once for several names", async () => {
    await mirrorSetCatalogue("151");
    await mirrorSetCatalogue("151");
    expect(listCatalogueSets).toHaveBeenCalledTimes(1);
  });
});
