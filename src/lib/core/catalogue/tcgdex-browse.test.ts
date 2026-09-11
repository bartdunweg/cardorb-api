import { afterEach, describe, expect, it, vi } from "vitest";

// The committed id maps, which are also the record of which sets TCGdex has cards for: M4 has
// them, M1 and PMCG1 are listed with a count and nothing under it.
vi.mock("../cardmarket-ids.ja.generated.json", () => ({
  default: { "M4-001": 1, "M4-002": null },
}));
vi.mock("../cardmarket-ids.ko.generated.json", () => ({ default: {} }));
vi.mock("../cardmarket-ids.zh-tw.generated.json", () => ({ default: {} }));
vi.mock("../cardmarket-ids.zh-cn.generated.json", () => ({ default: {} }));

const { isBrowseLanguage, listSetsIn, setIn } = await import("./tcgdex-browse");

const answers: Record<string, unknown> = {
  "/ja/series": [
    { id: "PMCG", name: "旧裏" },
    { id: "M", name: "MEGA" },
  ],
  "/ja/series/M": {
    id: "M",
    name: "MEGA",
    sets: [
      { id: "M1", name: "一", cardCount: { total: 10, official: 8 } },
      { id: "M4", name: "四", cardCount: { total: 120, official: 83 } },
    ],
  },
  "/ja/series/PMCG": {
    id: "PMCG",
    name: "旧裏",
    sets: [
      { id: "PMCG1", name: "拡張パック", cardCount: { total: 102, official: 102 } },
      // TCGdex's placeholders: one record copied under Chinese-looking ids, no card behind
      // either, on the Japanese, Chinese and Korean shelves alike (tcgdex-browse.ts).
      { id: "CS1a", name: "トリプレットビート", cardCount: { total: 101, official: 101 } },
      { id: "CS1b", name: "トリプレットビート", cardCount: { total: 101, official: 101 } },
    ],
  },
  "/en/sets/sv03.5": {
    id: "sv03.5",
    name: "151",
    logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo",
    symbol: "https://assets.tcgdex.net/univ/sv/sv03.5/symbol",
    releaseDate: "2023-09-22",
    serie: { id: "sv", name: "Scarlet & Violet" },
    cardCount: { total: 3, official: 2 },
    cards: [
      {
        id: "sv03.5-010",
        localId: "010",
        name: "Caterpie",
        image: "https://assets.tcgdex.net/en/sv/sv03.5/010",
      },
      { id: "sv03.5-002", localId: "002", name: "Ivysaur" },
      { id: "sv03.5-TG01", localId: "TG01", name: "Bulbasaur" },
    ],
  },
  "/ja/sets/M4": {
    id: "M4",
    name: "四",
    releaseDate: "2026-03-13",
    serie: { id: "M", name: "MEGA" },
    cardCount: { total: 2, official: 2 },
    cards: [
      { id: "M4-001", localId: "001", name: "ビードル" },
      { id: "M4-002", localId: "002", name: "コクーン" },
    ],
  },
};

/** What the two GraphQL reads answer: the English set index, and a set's facts. */
const INDEX = {
  sets: [
    {
      id: "sv03.5",
      name: "151",
      logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo",
      symbol: null,
      releaseDate: "2023-09-22",
      cardCount: { official: 165, total: 207 },
      serie: { name: "Scarlet & Violet" },
    },
    {
      id: "base1",
      name: "Base Set",
      logo: null,
      symbol: null,
      releaseDate: "1999-01-09",
      cardCount: { official: 102, total: 102 },
      serie: { name: "Base" },
    },
    {
      id: "sv03",
      name: "Obsidian Flames",
      logo: null,
      symbol: null,
      releaseDate: "2023-08-11",
      cardCount: { official: 197, total: 230 },
      serie: { name: "Scarlet & Violet" },
    },
    // The mobile game, which TCGdex files beside the printed sets and the shelf leaves out.
    {
      id: "A1",
      name: "Genetic Apex",
      logo: null,
      symbol: null,
      releaseDate: "2024-10-30",
      cardCount: { official: 226, total: 286 },
      serie: { id: "tcgp", name: "Pokémon TCG Pocket" },
    },
  ],
};
const FACTS = {
  cards: [
    { id: "sv03.5-010", rarity: "Common", types: ["Grass"] },
    { id: "sv03.5-002", rarity: "Uncommon", types: ["Grass"] },
    // A card of another set the contains-filter also answers, and one TCGdex could not fill.
    { id: "sv03-010", rarity: "Rare", types: ["Fire"] },
    null,
  ],
};

let graphqlDown = false;
/** Every GraphQL query sent, for the tests that count them. */
let queries: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  graphqlDown = false;
  queries = [];
});

const stub = () => {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    if (String(url).endsWith("/graphql")) {
      queries.push((JSON.parse(init?.body ?? "{}").query as string) ?? "");
      if (graphqlDown) return new Response("", { status: 503 });
      const query = JSON.parse(init?.body ?? "{}").query as string;
      return Response.json({ data: query.includes("sets {") ? INDEX : FACTS });
    }
    const key = url.replace("https://api.tcgdex.net/v2", "");
    asked.push(key);
    const body = answers[key];
    return new Response(body ? JSON.stringify(body) : "", { status: body ? 200 : 404 });
  });
  return asked;
};

const load = async () => {
  vi.resetModules();
  return import("./tcgdex-browse");
};

describe("tcgdex-browse", () => {
  it("knows the languages it can browse", () => {
    expect(isBrowseLanguage("ja")).toBe(true);
    expect(isBrowseLanguage("en")).toBe(false);
    expect(isBrowseLanguage(null)).toBe(false);
  });

  it("lists a language's sets newest serie first, in the English shelf's shape", async () => {
    stub();
    const sets = await listSetsIn("ja");
    expect(sets.map((s) => s.id)).toEqual(["M4", "M1", "PMCG1"]);
    expect(sets[0]).toEqual({
      id: "M4",
      name: "Ninja Spinner",
      localName: "四",
      series: "MEGA",
      releaseDate: null,
      total: 120,
      printedTotal: 83,
      logo: null,
      symbol: null,
      cardsRecorded: true,
    });
    // A set the translation list does not know keeps its own name.
    expect(sets[1]).toMatchObject({ id: "M1", name: "一", localName: null });
  });

  it("leaves TCGdex's cloned placeholder sets off the shelf, and keeps a lone empty set", async () => {
    stub();
    const sets = await listSetsIn("ja");
    // CS1a and CS1b share a name and a count and record no card: one placeholder, twice.
    expect(sets.map((s) => s.id)).toEqual(["M4", "M1", "PMCG1"]);
    // PMCG1 records no card either, but nothing else on the shelf is called that: it stays.
    expect(sets.find((s) => s.id === "PMCG1")).toMatchObject({ cardsRecorded: false });
  });

  it("says which sets the catalogue has recorded cards for, without asking it", async () => {
    /* TCGdex lists 68 of 184 Japanese sets and 92 of 95 Korean ones with a count and no card,
       and the series list — the shelf's one read — says "60 cards" for those too. The id maps
       already know: a card is in them for every card TCGdex lists. No request per set. */
    const asked = stub();
    const sets = await listSetsIn("ja");
    expect(sets.map((s) => [s.id, s.cardsRecorded])).toEqual([
      ["M4", true],
      ["M1", false],
      ["PMCG1", false],
    ]);
    expect(asked.filter((a) => a.includes("/sets/"))).toEqual([]);
  });

  it("reads a set with its cards and builds each scan's address", async () => {
    stub();
    const got = await setIn("ja", "M4");
    expect(got?.set.releaseDate).toBe("2026/03/13");
    // Named in English off the committed map, with the printed name beside it.
    expect(got?.cards[0]).toEqual({
      id: "M4-001",
      number: "001",
      name: "Weedle",
      localName: "ビードル",
      setName: "Ninja Spinner",
      image: "https://assets.tcgdex.net/ja/M/M4/001/low.webp",
      imageHigh: "https://assets.tcgdex.net/ja/M/M4/001/high.webp",
      rarity: null,
      types: [],
      series: "MEGA",
      tcgId: "M4-001",
    });
  });

  it("is null for a set the language does not have", async () => {
    stub();
    expect(await setIn("ja", "nope")).toBeNull();
  });

  describe("the English shelf", () => {
    it("lists every set newest first, with era, date, counts and art from one index", async () => {
      stub();
      const { englishSets } = await load();
      const sets = await englishSets();
      expect(sets.map((s) => s.id)).toEqual(["sv03.5", "sv03", "base1"]);
      expect(sets[0]).toEqual({
        id: "sv03.5",
        name: "151",
        localName: null,
        series: "Scarlet & Violet",
        releaseDate: "2023/09/22",
        total: 207,
        printedTotal: 165,
        logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo.webp",
        symbol: null,
        cardsRecorded: true,
      });
    });

    it("reads a set with its cards in binder order, each with its facts and its scan", async () => {
      stub();
      const { englishSet } = await load();
      const got = await englishSet("sv03.5");
      expect(got?.set).toMatchObject({
        id: "sv03.5",
        name: "151",
        series: "Scarlet & Violet",
        releaseDate: "2023/09/22",
        total: 3,
        printedTotal: 2,
      });
      expect(got?.cards.map((c) => c.number)).toEqual(["002", "010", "TG01"]);
      expect(got?.cards[1]).toEqual({
        id: "sv03.5-010",
        number: "010",
        name: "Caterpie",
        localName: null,
        setName: "151",
        series: "Scarlet & Violet",
        image: "https://assets.tcgdex.net/en/sv/sv03.5/010/low.webp",
        imageHigh: "https://assets.tcgdex.net/en/sv/sv03.5/010/high.webp",
        rarity: "Common",
        types: ["Grass"],
        tcgId: "sv03.5-010",
      });
      // A card the facts did not cover keeps what the other shelves show.
      expect(got?.cards[2]).toMatchObject({ rarity: null, types: [] });
    });

    it("shows the set without facts when TCGdex's GraphQL is down, rather than not at all", async () => {
      stub();
      const { englishSet } = await load();
      graphqlDown = true;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const got = await englishSet("sv03.5");
      expect(got?.cards).toHaveLength(3);
      expect(got?.cards[0]).toMatchObject({ rarity: null, types: [] });
    });

    it("opens a set by pokemontcg.io's old id, and in the other case", async () => {
      stub();
      const { englishSet, resolveEnglishSetId } = await load();
      expect(await resolveEnglishSetId("sv3pt5")).toBe("sv03.5");
      expect(await resolveEnglishSetId("SV03.5")).toBe("sv03.5");
      expect(await resolveEnglishSetId("nope")).toBeNull();
      expect((await englishSet("sv3pt5"))?.set.id).toBe("sv03.5");
      expect(await englishSet("nope")).toBeNull();
    });

    it("leaves the mobile game's sets out, and answers 404 for one asked by id", async () => {
      stub();
      const { englishSets, englishSet, isPocketSet } = await load();
      expect((await englishSets()).map((s) => s.id)).not.toContain("A1");
      expect(isPocketSet("A1")).toBe(true);
      expect(isPocketSet("sv03.5")).toBe(false);
      expect(await englishSet("A1")).toBeNull();
    });

    it("reads the index once for many reads", async () => {
      stub();
      const { englishSets, englishSet } = await load();
      await englishSets();
      await englishSet("sv03.5");
      await englishSets();
      expect(queries.filter((q) => q.includes("sets {"))).toHaveLength(1);
    });
  });
});
