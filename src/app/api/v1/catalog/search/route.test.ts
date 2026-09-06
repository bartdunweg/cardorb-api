import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const searchCards = vi.fn();
const getRows = vi.fn();

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/core/catalogue/ptcg-search", () => ({
  searchCards: (...a: unknown[]) => searchCards(...a),
}));
/* Both of these are `import "server-only"` underneath — viewer.ts directly,
   collection.ts through the Supabase clients — which throws the moment vitest
   imports them. Replaced wholesale for that reason, the same way guard.ts is,
   and then used for the ownership overlay the route attaches to every result. */
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
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
  searchCards.mockResolvedValue([
    {
      id: "base1-4",
      number: "4",
      name: "Charizard",
      setName: "Base",
      image: "https://img/base1/4/small",
      imageHigh: "https://img/base1/4/large",
      rarity: "Rare Holo",
      types: ["Fire"],
    },
  ]);
});
afterEach(() => {
  searchCards.mockClear();
  getRows.mockClear();
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
    expect(searchCards).toHaveBeenCalledWith("char", 1);
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "base1-4", name: "Charizard", rarity: "Rare Holo" });
  });

  it("switches to filter mode when any filter field is present, ignoring query", async () => {
    const res = await search(new URLSearchParams({ name: "char", query: "should be ignored" }));
    expect(searchCards).toHaveBeenCalledWith({ name: "char", number: "", set: "", type: "" }, 1);
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
  });

  it("does not require two characters in filter mode", async () => {
    const res = await search(new URLSearchParams({ number: "6" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith({ name: "", number: "6", set: "", type: "" }, 1);
  });

  it("trims filter fields before checking whether any are present", async () => {
    const res = await search(new URLSearchParams({ name: "   " }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("forwards an explicit page number", async () => {
    await search(new URLSearchParams({ query: "char", page: "3" }));
    expect(searchCards).toHaveBeenCalledWith("char", 3);
  });

  it("falls back to page 1 for an invalid page value", async () => {
    await search(new URLSearchParams({ query: "char", page: "not-a-number" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1);

    await search(new URLSearchParams({ query: "char", page: "-1" }));
    expect(searchCards).toHaveBeenCalledWith("char", 1);
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
});
