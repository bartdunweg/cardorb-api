import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const searchCards = vi.fn();
const getRows = vi.fn();
const guidePricesFor = vi.fn(async (..._a: unknown[]) => new Map());
const englishSets = vi.fn(async () => [{ id: "base1", name: "Base" }]);

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/core/catalogue/tcgdex-search", () => ({
  searchCards: (...a: unknown[]) => searchCards(...a),
}));
/* The English set index is a network read; the join resolves the fixture rows against this one. */
vi.mock("@/lib/core/catalogue/tcgdex-browse", () => ({
  englishSets: () => englishSets(),
  isBrowseLanguage: (v: unknown) => ["ja", "zh-tw", "zh-cn", "ko"].includes(v as string),
}));
/* Both of these are `import "server-only"` underneath — viewer.ts directly,
   collection.ts through the Supabase clients — which throws the moment vitest
   imports them. Replaced wholesale for that reason, the same way guard.ts is,
   and then used for the ownership overlay the route attaches to every result. */
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
  guidePricesFor: (...a: unknown[]) => guidePricesFor(...a),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const search = (query: URLSearchParams) =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/search?${query}`));

const row = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  name: "Charizard",
  number: "004",
  setName: "Base",
  rarity: null,
  gen: null,
  types: [],
  owned: true,
  excluded: false,
  acquiredAt: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  ...over,
});

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  getRows.mockResolvedValue({ rows: [], failed: false });
  searchCards.mockResolvedValue({
    total: 1,
    cards: [
      {
        id: "base1-4",
        number: "4",
        name: "Charizard",
        setName: "Base",
        image: "https://img/base1/4/small",
        imageHigh: "https://img/base1/4/large",
        rarity: "Rare Holo",
        types: ["Fire"],
        tcgId: "base1-4",
      },
    ],
  });
});
afterEach(() => {
  guidePricesFor.mockClear();
  searchCards.mockClear();
  getRows.mockClear();
  englishSets.mockClear();
});

describe("GET /api/v1/catalog/search", () => {
  it("refuses a query shorter than two characters", async () => {
    const res = await search(new URLSearchParams({ query: "c" }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses a missing query the same way", async () => {
    const res = await search(new URLSearchParams());
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await search(new URLSearchParams({ query: "char" }));
    expect(res.status).toBe(401);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("passes the trimmed query through and returns what it finds", async () => {
    const res = await search(new URLSearchParams({ query: "  char  " }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null);
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "base1-4", name: "Charizard", rarity: "Rare Holo" });
  });

  it("switches to filter mode when any filter field is present, ignoring query", async () => {
    const res = await search(new URLSearchParams({ name: "char", query: "should be ignored" }));
    expect(searchCards).toHaveBeenCalledWith(
      { name: "char", number: "", set: "", type: "" },
      1,
      null,
    );
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
  });

  it("does not require two characters in filter mode", async () => {
    const res = await search(new URLSearchParams({ number: "6" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith({ name: "", number: "6", set: "", type: "" }, 1, null);
  });

  it("trims filter fields before checking whether any are present", async () => {
    const res = await search(new URLSearchParams({ name: "   " }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("forwards an explicit page number", async () => {
    await search(new URLSearchParams({ query: "char", page: "3" }));
    expect(searchCards).toHaveBeenCalledWith("char", 3, null);
  });

  it("falls back to page 1 for an invalid page value", async () => {
    await search(new URLSearchParams({ query: "char", page: "not-a-number" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null);

    await search(new URLSearchParams({ query: "char", page: "-1" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null);
  });

  it("answers 502 with a sentence, not 400, when searchCards fails", async () => {
    searchCards.mockRejectedValueOnce(new Error("pokemontcg.io search unavailable"));
    const res = await search(new URLSearchParams({ query: "char" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("The catalogue did not answer. Try again in a moment.");
  });

  it("marks a result the viewer already holds", async () => {
    getRows.mockResolvedValue({ rows: [row({ quantity: 2 })], failed: false });
    const res = await search(new URLSearchParams({ query: "char" }));
    const { cards } = await res.json();
    expect(cards[0]).toMatchObject({
      owned: true,
      wishlist: false,
      quantity: 2,
      itemIds: ["row-1"],
    });
  });

  it("leaves a result unmarked when the viewer holds a different card at that number", async () => {
    getRows.mockResolvedValue({ rows: [row({ name: "Blastoise" })], failed: false });
    const res = await search(new URLSearchParams({ query: "char" }));
    const { cards } = await res.json();
    expect(cards[0]).toMatchObject({ owned: false, wishlist: false, quantity: 0, itemIds: [] });
  });

  it("does not read the collection when the search itself failed", async () => {
    searchCards.mockRejectedValueOnce(new Error("pokemontcg.io search unavailable"));
    await search(new URLSearchParams({ query: "char" }));
    expect(getRows).not.toHaveBeenCalled();
  });
  it("asks the catalogue named by ?language, and joins ownership by that language alone", async () => {
    const res = await search(new URLSearchParams({ query: "リザードン", language: "ja" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith("リザードン", 1, "ja");
    expect(englishSets).not.toHaveBeenCalled();
  });

  it("reads language=en as the English catalogue", async () => {
    await search(new URLSearchParams({ query: "char", language: "en" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1, null);
  });

  it("prices every result from the guide, by the id everything priced is keyed by", async () => {
    guidePricesFor.mockResolvedValueOnce(
      new Map([["base1-4", { price: { market: 12.5 }, holo: { market: 40 } }]]),
    );
    const res = await search(new URLSearchParams({ query: "char", language: "ja" }));
    const { cards } = await res.json();
    expect(guidePricesFor).toHaveBeenCalledWith(["base1-4"], "ja");
    expect(cards[0]).toMatchObject({ price: { market: 12.5 }, priceHolo: { market: 40 } });
  });

  it("leaves a null price under a result the guide does not price", async () => {
    const res = await search(new URLSearchParams({ query: "char" }));
    const { cards } = await res.json();
    expect(guidePricesFor).toHaveBeenCalledWith(["base1-4"], null);
    expect(cards[0]).toMatchObject({ price: null, priceHolo: null });
  });

  it("refuses a language it has no catalogue for", async () => {
    const res = await search(new URLSearchParams({ query: "char", language: "de" }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });
});
