import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const listSetsIn = vi.fn();
const setIn = vi.fn();
vi.mock("./tcgdex-browse", () => ({
  listSetsIn: (...a: unknown[]) => listSetsIn(...a),
  setIn: (...a: unknown[]) => setIn(...a),
}));

class CatalogueNotFound extends Error {
  name = "CatalogueNotFound";
}
const json = vi.fn();
vi.mock("./tcgdex-client", () => ({ CatalogueNotFound, json: (...a: unknown[]) => json(...a) }));

/** Which TCGdex scans have a file behind them. */
const tcgdexScan = vi.fn(async (stem: string): Promise<string | null> => stem);
vi.mock("./artwork", async (actual) => ({
  ...(await actual<typeof import("./artwork")>()),
  tcgdexScan: (stem: string) => tcgdexScan(stem),
}));

const canStoreImages = vi.fn(async () => false);
const keepImage = vi.fn(async (a: string | null) => a);
vi.mock("./image-store", () => ({
  canStoreImages: () => canStoreImages(),
  keepImage: (a: string | null) => keepImage(a),
  storedAddress: () => null,
}));
const japanGroups = vi.fn(async (): Promise<unknown[]> => []);
const groupCards = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("./tcgplayer-japan", async (actual) => ({
  ...(await actual<typeof import("./tcgplayer-japan")>()),
  japanGroups: () => japanGroups(),
  groupCards: () => groupCards(),
}));
vi.mock("./mirror", () => ({
  CATALOGUE_FORMAT: 1,
  ownArt: async (a: string | null) => a,
}));

const { syncLanguageMirror } = await import("./mirror-language");

type Call = { table: string; op: string; args: unknown[] };
function fakeStore(seed: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "lt", "order", "range", "upsert", "delete"])
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    chain.then = (resolve: (v: unknown) => unknown) => {
      const data = seed[table] ?? [];
      return resolve({ data, error: null, count: data.length });
    };
    return chain;
  };
  return { db: { from } as unknown as SupabaseClient, calls };
}

const shelfSet = (id: string, total = 1) => ({
  id,
  name: `Set ${id}`,
  localName: `セット ${id}`,
  series: "Scarlet & Violet",
  releaseDate: null,
  total,
  printedTotal: total,
  cardsRecorded: true,
  logo: null,
  symbol: null,
});

const card = (id: string, number: string) => ({
  id,
  number,
  name: "Charizard ex",
  localName: "リザードンex",
  setName: "ignored",
  image: `https://assets.tcgdex.net/ja/SV/${id.split("-")[0]}/${number}/low.webp`,
  imageHigh: null,
  rarity: null,
  types: [],
  series: "Scarlet & Violet",
  tcgId: id,
});

beforeEach(() => {
  vi.clearAllMocks();
  japanGroups.mockResolvedValue([]);
  groupCards.mockResolvedValue([]);
  keepImage.mockImplementation(async (a: string | null) => a);
  tcgdexScan.mockImplementation(async (stem: string) => stem);
  canStoreImages.mockResolvedValue(false);
  json.mockResolvedValue({
    rarity: "Double rare",
    types: ["Fire"],
    category: "Pokemon",
    illustrator: "PLANETA",
    hp: 330,
    stage: "Stage2",
    evolveFrom: "Charmeleon",
    regulationMark: "G",
    variants: { firstEdition: false },
    variants_detailed: [{ type: "holo", size: "standard" }],
  });
  setIn.mockImplementation(async (_lang: string, id: string) => ({
    set: { ...shelfSet(id), releaseDate: "2023/06/16", serieId: "SV" },
    cards: [card(`${id}-006`, "006")],
  }));
});

describe("syncLanguageMirror", () => {
  it("copies a Japanese set into the shared copy under its own language", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV2a")]);
    const { db, calls } = fakeStore();
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.copied).toEqual(["SV2a"]);

    const setRow = calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert");
    expect(setRow?.args[0]).toMatchObject({
      language: "ja",
      id: "SV2a",
      name: "Set SV2a",
      local_name: "セット SV2a",
      serie_id: "SV",
      cards_recorded: true,
      sort_order: 0,
    });
    expect(setRow?.args[1]).toEqual({ onConflict: "language,id" });

    const cardRows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert");
    expect(cardRows?.args[1]).toEqual({ onConflict: "language,id" });
    expect(cardRows?.args[0]).toEqual([
      expect.objectContaining({
        language: "ja",
        id: "SV2a-006",
        name: "Charizard ex",
        local_name: "リザードンex",
        rarity: "Double Rare",
        types: ["Fire"],
        illustrator: "PLANETA",
        hp: 330,
        evolve_from: "Charmeleon",
        variants: [{ type: "holo" }],
        languages: null,
      }),
    ]);
    const stamped = calls.find((c) => c.table === "catalogue_sync" && c.op === "upsert");
    expect(stamped?.args[0]).toMatchObject({ language: "ja", set_id: "SV2a", format: 3 });
  });

  it("takes Limitless's plain print where TCGdex has no file, and TCGdex's where it has", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SM12a")]);
    tcgdexScan.mockResolvedValue(null);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string;
    }[];
    expect(decodeURIComponent(rows[0]!.image)).toContain("tpc/SM12a/SM12a_6_R_JP_LG.png");
  });

  it("never keeps TCGdex's scan of a set it photographed in reverse", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV2a")]);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string;
    }[];
    expect(tcgdexScan).not.toHaveBeenCalled();
    expect(decodeURIComponent(rows[0]!.image)).toContain("limitless");
  });

  it("writes no picture where the bucket could not keep one", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SM12a")]);
    tcgdexScan.mockResolvedValue(null);
    canStoreImages.mockResolvedValue(true);
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string | null;
    }[];
    expect(rows[0]!.image).toBeNull();
  });

  // SV-P 022: a promo, whose number is no file name at Limitless; TCGplayer's Japanese shelf sells
  // it as product 587779 (tcgplayer-ids.ja.generated.json).
  it("keeps TCGplayer's product picture where neither TCGdex nor Limitless has the card", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV-P")]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("SV-P"), serieId: "SV" },
      cards: [card("SV-P-022", "022")],
    });
    tcgdexScan.mockResolvedValue(null);
    canStoreImages.mockResolvedValue(true);
    keepImage.mockImplementation(async (a: string | null) =>
      a?.includes("tcgplayer-cdn") ? "https://images.cardorb.com/tcgplayer/587779.jpg" : a,
    );
    vi.stubGlobal("fetch", async () => new Response(null, { status: 200 }));
    const { db, calls } = fakeStore();
    await syncLanguageMirror(db, "ja", { parallel: 1 });
    vi.unstubAllGlobals();
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0] as {
      image: string | null;
    }[];
    expect(rows[0]!.image).toBe("https://images.cardorb.com/tcgplayer/587779.jpg");
  });

  it("fills a set TCGdex lists without cards from TCGplayer's Japanese shelf", async () => {
    listSetsIn.mockResolvedValue([{ ...shelfSet("S4a"), name: "Shiny Star V" }]);
    setIn.mockResolvedValue({
      set: { ...shelfSet("S4a"), name: "Shiny Star V", cardsRecorded: false, serieId: "S" },
      cards: [],
    });
    japanGroups.mockResolvedValue([
      { groupId: 23643, name: "S4a: Shiny Star V", abbreviation: "S4a" },
    ]);
    groupCards.mockResolvedValue([
      {
        productId: 578001,
        number: "003",
        name: "Charizard V",
        rarity: "Double Rare",
        cardType: "Fire",
        hp: 220,
        stage: "Basic",
        image: "https://tcgplayer-cdn.tcgplayer.com/product/578001_in_1000x1000.jpg",
      },
    ]);
    const { db, calls } = fakeStore();
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.copied).toEqual(["S4a"]);
    expect(json).not.toHaveBeenCalled();
    const rows = calls.find((c) => c.table === "catalogue_cards" && c.op === "upsert")?.args[0];
    expect(rows).toEqual([
      expect.objectContaining({
        id: "S4a-003",
        local_id: "003",
        name: "Charizard V",
        rarity: "Double Rare",
        types: ["Fire"],
        category: "Pokemon",
        hp: 220,
        tcgplayer_product_id: 578001,
        image: "https://tcgplayer-cdn.tcgplayer.com/product/578001_in_1000x1000.jpg",
      }),
    ]);
    expect(
      calls.find((c) => c.table === "catalogue_sets" && c.op === "upsert")?.args[0],
    ).toMatchObject({
      id: "S4a",
      cards_recorded: true,
    });
  });

  it("leaves a set for the next run where a card's record could not be read", async () => {
    listSetsIn.mockResolvedValue([shelfSet("SV1a")]);
    json.mockRejectedValue(new Error("TCGdex answered 503"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, calls } = fakeStore();
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.failed).toEqual(["SV1a"]);
    expect(calls.some((c) => c.table === "catalogue_cards" && c.op === "upsert")).toBe(false);
  });

  it("copies a set it has never seen ahead of one it holds, and one in an older shape next", async () => {
    listSetsIn.mockResolvedValue([shelfSet("held"), shelfSet("behind"), shelfSet("new")]);
    const { db } = fakeStore({
      catalogue_sync: [
        { set_id: "held", cards: 1, synced_at: "2026-09-01T00:00:00Z", format: 3 },
        { set_id: "behind", cards: 1, synced_at: "2026-09-13T00:00:00Z", format: 2 },
      ],
    });
    const report = await syncLanguageMirror(db, "ja", { parallel: 1 });
    expect(report.copied).toEqual(["new", "behind", "held"]);
  });
});
