import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two English reads a page falls back to while the nightly copy holds nothing: TCGdex's own
 * index and set record. Their facts stand; their pictures are TCGdex's addresses, which are not
 * files of ours, so a client is sent null for each (Bart, 2026-09-15). And the fallback asks no
 * picture host: pokemontcg.io's logos were a HEAD per set.
 */

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./set-catalogue-mirror", () => ({
  copiedEnglishSets: async () => null,
  englishSetFromCopy: async () => null,
  mirrorSetCatalogue: async () => null,
}));
const englishSets = vi.fn();
const englishSet = vi.fn();
vi.mock("./tcgdex-browse", () => ({
  englishSets: () => englishSets(),
  englishSet: (...a: unknown[]) => englishSet(...a),
}));

const { englishSetOfDay, englishShelfSets } = await import("./catalogue");

const SET = {
  id: "sv05",
  name: "Temporal Forces",
  localName: null,
  series: "Scarlet & Violet",
  releaseDate: "2024/03/22",
  total: 218,
  printedTotal: 162,
  cardsRecorded: true,
  logo: "https://assets.tcgdex.net/en/sv/sv05/logo.webp",
  symbol: "https://assets.tcgdex.net/en/sv/sv05/symbol.webp",
};

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("englishShelfSets, before the copy holds the shelf", () => {
  it("keeps TCGdex's sets and sends no wordmark of theirs, asking pokemontcg.io nothing", async () => {
    englishSets.mockResolvedValue([SET, { ...SET, id: "sv06", logo: null, symbol: null }]);
    const sets = await englishShelfSets();
    expect(sets.map((s) => [s.id, s.logo, s.symbol])).toEqual([
      ["sv05", null, null],
      ["sv06", null, null],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("englishSetOfDay, before the copy holds the set", () => {
  it("keeps the set's facts and sends none of TCGdex's pictures", async () => {
    englishSet.mockResolvedValue({
      set: SET,
      cards: [
        {
          id: "sv05-001",
          number: "001",
          name: "Bulbasaur",
          image: "https://assets.tcgdex.net/en/sv/sv05/001/low.webp",
          imageHigh: "https://assets.tcgdex.net/en/sv/sv05/001/high.webp",
          rarity: "Common",
        },
      ],
    });
    const found = await englishSetOfDay("sv05");
    expect(found?.set).toMatchObject({ id: "sv05", total: 218, logo: null, symbol: null });
    expect(found?.cards[0]).toMatchObject({ rarity: "Common", image: null, imageHigh: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
