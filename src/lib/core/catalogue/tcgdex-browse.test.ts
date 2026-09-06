import { afterEach, describe, expect, it, vi } from "vitest";
import { isBrowseLanguage, listSetsIn, setIn } from "./tcgdex-browse";

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
    sets: [{ id: "PMCG1", name: "拡張パック", cardCount: { total: 102, official: 102 } }],
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

afterEach(() => vi.unstubAllGlobals());

const stub = () =>
  vi.stubGlobal("fetch", async (url: string) => {
    const key = url.replace("https://api.tcgdex.net/v2", "");
    const body = answers[key];
    return new Response(body ? JSON.stringify(body) : "", { status: body ? 200 : 404 });
  });

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
      logo: "https://assets.tcgdex.net/ja/M/M4/001/low.webp",
      symbol: null,
    });
    // A set the translation list does not know keeps its own name.
    expect(sets[1]).toMatchObject({ id: "M1", name: "一", localName: null });
  });

  it("reads a set with its cards and builds each scan's address", async () => {
    stub();
    const got = await setIn("ja", "M4");
    expect(got?.set.releaseDate).toBe("2026/03/13");
    expect(got?.cards[0]).toEqual({
      id: "M4-001",
      number: "001",
      name: "ビードル",
      setName: "Ninja Spinner",
      image: "https://assets.tcgdex.net/ja/M/M4/001/low.webp",
      imageHigh: "https://assets.tcgdex.net/ja/M/M4/001/high.webp",
      rarity: null,
      types: [],
      series: "MEGA",
    });
  });

  it("is null for a set the language does not have", async () => {
    stub();
    expect(await setIn("ja", "nope")).toBeNull();
  });
});
