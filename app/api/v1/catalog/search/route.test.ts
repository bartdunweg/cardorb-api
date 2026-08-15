import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const searchCards = vi.fn();

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("../../../../../lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("../../../../../lib/core/ptcg-search", () => ({
  searchCards: (...a: unknown[]) => searchCards(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const search = (query: URLSearchParams) =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/search?${query}`));

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
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
afterEach(() => searchCards.mockClear());

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
    expect(searchCards).toHaveBeenCalledWith("char");
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "base1-4", name: "Charizard", rarity: "Rare Holo" });
  });

  it("switches to filter mode when any filter field is present, ignoring query", async () => {
    const res = await search(new URLSearchParams({ name: "char", query: "should be ignored" }));
    expect(searchCards).toHaveBeenCalledWith({ name: "char", number: "", set: "", type: "" });
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
  });

  it("does not require two characters in filter mode", async () => {
    const res = await search(new URLSearchParams({ number: "6" }));
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith({ name: "", number: "6", set: "", type: "" });
  });

  it("trims filter fields before checking whether any are present", async () => {
    const res = await search(new URLSearchParams({ name: "   " }));
    expect(res.status).toBe(400);
    expect(searchCards).not.toHaveBeenCalled();
  });
});
