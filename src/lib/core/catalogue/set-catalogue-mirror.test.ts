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
const catalogueSetCards = vi.fn();

vi.mock("@/lib/storage/postgres", () => ({
  listCatalogueSets: (...a: unknown[]) => listCatalogueSets(...a),
  catalogueCardsBySets: (...a: unknown[]) => catalogueCardsBySets(...a),
  catalogueSetCards: (...a: unknown[]) => catalogueSetCards(...a),
  listCatalogueSync: (...a: unknown[]) => listCatalogueSync(...a),
}));
const listCatalogueSync = vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []);
/* The id resolver asks TCGdex's set index; here every id is already TCGdex's own. */
vi.mock("./tcgdex-browse", async (real) => ({
  ...(await real<typeof import("./tcgdex-browse")>()),
  resolveEnglishSetId: async (id: string) => id,
}));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));

const {
  copiedEnglishSets,
  copiedLanguageSets,
  englishSetFromCopy,
  forgetCopiedSets,
  languageSetFromCopy,
  mirrorSetCatalogue,
} = await import("./set-catalogue-mirror");

const set = (over: Partial<CatalogueSetRecord> = {}): CatalogueSetRecord => ({
  id: "sv03.5",
  name: "151",
  series: "Scarlet & Violet",
  release_date: "2023/09/22",
  logo: "https://images.cardorb.com/en/sv/sv03.5/logo.webp",
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
    image: "https://images.cardorb.com/en/sv/sv03.5/001",
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

describe("englishSetFromCopy", () => {
  it("answers a set page's set and cards out of the copy, facts and pictures included", async () => {
    catalogueSetCards.mockResolvedValue([
      card({ id: "sv03.5-010", local_id: "010", name: "Charmander", category: "Pokemon" }),
      card({ category: "Pokemon" }),
      card({
        id: "sv03.5-166",
        local_id: "166",
        name: "Antique Dome Fossil",
        rarity: "Uncommon",
        types: [],
        image: null,
        category: "Trainer",
        trainer_type: "Item",
      }),
    ]);

    const found = await englishSetFromCopy("sv03.5");

    expect(found?.set).toMatchObject({
      id: "sv03.5",
      name: "151",
      series: "Scarlet & Violet",
      total: 207,
      printedTotal: 165,
      abbreviation: "MEW",
      cardsRecorded: true,
    });
    // In the set's own order, whatever order the rows came in.
    expect(found?.cards.map((c) => c.number)).toEqual(["001", "010", "166"]);
    expect(found?.cards[0]).toEqual({
      id: "sv03.5-001",
      number: "001",
      name: "Bulbasaur",
      localName: null,
      setName: "151",
      series: "Scarlet & Violet",
      image: "https://images.cardorb.com/en/sv/sv03.5/001/low.webp",
      imageHigh: "https://images.cardorb.com/en/sv/sv03.5/001/high.webp",
      rarity: "Common",
      types: ["Grass"],
      category: "Pokemon",
      trainerType: null,
      tcgId: "sv03.5-001",
    });
    // A card the copy holds no picture of has none, as the page showed it before.
    expect(found?.cards[2]).toMatchObject({ image: null, imageHigh: null, trainerType: "Item" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("carries the copy's full-art flag, and leaves it out of a row read without one", async () => {
    catalogueSetCards.mockResolvedValue([
      card({ id: "sv03.5-001", local_id: "001", full_art: false }),
      card({ id: "sv03.5-199", local_id: "199", name: "Charizard ex", full_art: true }),
      card({ id: "sv03.5-200", local_id: "200", name: "Blastoise ex" }),
    ]);
    const found = await englishSetFromCopy("sv03.5");
    expect(found?.cards[0]?.fullArt).toBe(false);
    expect(found?.cards[1]?.fullArt).toBe(true);
    expect(found?.cards[2]).not.toHaveProperty("fullArt");
  });

  it("answers null for a set the copy has no cards of, so the page asks TCGdex", async () => {
    catalogueSetCards.mockResolvedValue([]);
    expect(await englishSetFromCopy("sv03.5")).toBeNull();
  });

  it("answers null for a set the copy has no record of", async () => {
    catalogueSetCards.mockResolvedValue([card()]);
    expect(await englishSetFromCopy("sv99")).toBeNull();
  });
});

describe("copiedEnglishSets", () => {
  it("answers the shelf out of the copy, newest first, with the logo stored for it", async () => {
    listCatalogueSets.mockResolvedValue([
      set({
        id: "base1",
        name: "Base Set",
        series: "Base",
        release_date: "1999/01/09",
        logo: null,
      }),
      set({
        id: "svp",
        name: "SVP Black Star Promos",
        logo: "https://images.cardorb.com/en/swsh/swshp/logo.webp",
      }),
    ]);

    const sets = await copiedEnglishSets();

    expect(sets?.map((s) => s.id)).toEqual(["svp", "base1"]);
    expect(sets?.[0]).toEqual({
      id: "svp",
      name: "SVP Black Star Promos",
      localName: null,
      series: "Scarlet & Violet",
      releaseDate: "2023/09/22",
      total: 207,
      printedTotal: 165,
      cardsRecorded: true,
      logo: "https://images.cardorb.com/en/swsh/swshp/logo.webp",
      symbol: null,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("answers null for an empty copy, so the shelf asks TCGdex", async () => {
    listCatalogueSets.mockResolvedValue([]);
    expect(await copiedEnglishSets()).toBeNull();
  });
});

describe("a picture in the copy that is not a file of ours", () => {
  // Bart, 2026-09-15: a client is sent only files in our bucket. The copy holds nothing else today;
  // an outside address that ever reached it reads as no picture, and nobody is asked for one.
  const OUTSIDE = {
    logo: "https://images.pokemontcg.io/sv3pt5/logo.png",
    symbol: "https://assets.tcgdex.net/en/sv/sv03.5/symbol.webp",
  };
  const outsideCard = card({ image: "https://assets.tcgdex.net/en/sv/sv03.5/001" });

  it("is no picture on a set page", async () => {
    listCatalogueSets.mockResolvedValue([set(OUTSIDE)]);
    catalogueSetCards.mockResolvedValue([outsideCard]);
    const found = await englishSetFromCopy("sv03.5");
    expect(found?.set).toMatchObject({ logo: null, symbol: null });
    expect(found?.cards[0]).toMatchObject({ image: null, imageHigh: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("is no wordmark on the shelves", async () => {
    listCatalogueSets.mockResolvedValue([set(OUTSIDE)]);
    expect((await copiedEnglishSets())?.[0]).toMatchObject({ logo: null, symbol: null });
    forgetCopiedSets();
    listCatalogueSets.mockResolvedValue([set({ ...OUTSIDE, id: "SV2a", cards_recorded: true })]);
    expect((await copiedLanguageSets("ja"))?.[0]).toMatchObject({ logo: null });
  });

  it("is no picture in the collection's set catalogue, where the symbol of ours stands in", async () => {
    listCatalogueSets.mockResolvedValue([
      set({ logo: OUTSIDE.logo, symbol: "https://images.cardorb.com/en/sv/sv03.5/symbol.webp" }),
    ]);
    catalogueCardsBySets.mockResolvedValue([[outsideCard]]);
    const cat = await mirrorSetCatalogue("151");
    expect(cat?.byNumber["001"]?.image).toBeNull();
    expect(cat?.logo).toBe("https://images.cardorb.com/en/sv/sv03.5/symbol.webp");
  });

  it("is no picture on another language's set page", async () => {
    listCatalogueSets.mockResolvedValue([set({ ...OUTSIDE, id: "SV2a", cards_recorded: true })]);
    catalogueSetCards.mockResolvedValue([
      card({
        id: "SV2a-006",
        set_id: "SV2a",
        image:
          "/api/cover?url=https%3A%2F%2Flimitlesstcg.nyc3.cdn.digitaloceanspaces.com%2Ftpc%2FSV2a%2FSV2a_6_R_JP_LG.png",
      }),
    ]);
    const found = await languageSetFromCopy("ja", "SV2a");
    expect(found?.set.logo).toBeNull();
    expect(found?.cards[0]).toMatchObject({ image: null, imageHigh: null });
  });
});

describe("englishSetFromCopy, by another id", () => {
  it("finds a set by pokemontcg.io's id without asking TCGdex for its index", async () => {
    catalogueSetCards.mockResolvedValue([card()]);
    const found = await englishSetFromCopy("sv3pt5");
    expect(found?.set.id).toBe("sv03.5");
    expect(catalogueSetCards).toHaveBeenCalledWith(expect.anything(), "sv03.5");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("the Japanese shelf out of the copy", () => {
  const jaSet = (over: Partial<CatalogueSetRecord> = {}): CatalogueSetRecord =>
    set({
      id: "SV2a",
      name: "Pokémon Card 151",
      local_name: "ポケモンカード151",
      series: "Scarlet & Violet",
      release_date: "2023/06/16",
      logo: null,
      abbreviation: null,
      total: 210,
      printed_total: 165,
      cards_recorded: true,
      sort_order: 1,
      ...over,
    });

  beforeEach(() => {
    forgetCopiedSets();
    vi.clearAllMocks();
  });

  it("lists the sets in the shelf's own order, printed names and release dates beside, without art", async () => {
    listCatalogueSets.mockResolvedValue([
      jaSet(),
      jaSet({
        id: "SV3",
        name: "Ruler of the Black Flame",
        local_name: "黒炎の支配者",
        sort_order: 0,
      }),
    ]);
    const sets = await copiedLanguageSets("ja");
    expect(listCatalogueSets).toHaveBeenCalledWith(expect.anything(), "ja");
    expect(sets?.map((s) => [s.id, s.localName, s.releaseDate, s.logo])).toEqual([
      ["SV3", "黒炎の支配者", "2023/06/16", null],
      ["SV2a", "ポケモンカード151", "2023/06/16", null],
    ]);
  });

  it("is null while the copy holds none of the shelf, so the caller asks TCGdex", async () => {
    listCatalogueSets.mockResolvedValue([]);
    expect(await copiedLanguageSets("ja")).toBeNull();
  });

  it("reads a set's cards with their printed names and kept pictures", async () => {
    listCatalogueSets.mockResolvedValue([jaSet()]);
    catalogueSetCards.mockResolvedValue([
      card({
        id: "SV2a-006",
        set_id: "SV2a",
        local_id: "006",
        name: "Charizard ex",
        local_name: "リザードンex",
        rarity: "Double Rare",
        image: "https://images.cardorb.com/limitless/tpc/SV2a/SV2a_6_R_JP_LG.png",
        full_art: true,
      }),
    ]);
    const found = await languageSetFromCopy("ja", "SV2a");
    expect(catalogueSetCards).toHaveBeenCalledWith(expect.anything(), "SV2a", "ja");
    expect(found?.set).toMatchObject({ id: "SV2a", localName: "ポケモンカード151" });
    expect(found?.cards[0]).toMatchObject({
      id: "SV2a-006",
      name: "Charizard ex",
      localName: "リザードンex",
      setName: "Pokémon Card 151",
      image: "https://images.cardorb.com/limitless/tpc/SV2a/SV2a_6_R_JP_LG.png",
      imageHigh: null,
      fullArt: true,
      tcgId: "SV2a-006",
    });
  });

  it("answers a set the catalogue lists without cards as that, and one it lacks as null", async () => {
    listCatalogueSets.mockResolvedValue([jaSet({ id: "CS1a", cards_recorded: false })]);
    expect(await languageSetFromCopy("ja", "CS1a")).toMatchObject({
      set: { id: "CS1a", cardsRecorded: false },
      cards: [],
    });
    expect(catalogueSetCards).not.toHaveBeenCalled();
    expect(await languageSetFromCopy("ja", "SV9")).toBeNull();
  });
});

describe("empty sets on the shelf", () => {
  beforeEach(() => {
    forgetCopiedSets();
    vi.clearAllMocks();
  });

  it("leaves out an English set the copy holds no card of", async () => {
    listCatalogueSets.mockResolvedValue([set(), set({ id: "rc", name: "Radiant Collection" })]);
    listCatalogueSync.mockResolvedValue([
      { setId: "sv03.5", cards: 207, syncedAt: "", format: 1 },
      { setId: "rc", cards: 0, syncedAt: "", format: 1 },
    ]);
    expect((await copiedEnglishSets())?.map((s) => s.id)).toEqual(["sv03.5"]);
  });

  it("leaves out a Japanese set with no cards recorded anywhere", async () => {
    listCatalogueSets.mockResolvedValue([
      set({ id: "SV2a", cards_recorded: true, sort_order: 0 }),
      set({ id: "ADV1", cards_recorded: false, sort_order: 1 }),
    ]);
    expect((await copiedLanguageSets("ja"))?.map((s) => s.id)).toEqual(["SV2a"]);
  });
});
