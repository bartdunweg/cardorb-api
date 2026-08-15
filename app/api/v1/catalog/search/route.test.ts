import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const setCatalogue = vi.fn();
const searchCatalogue = vi.fn();

// See app/api/v1/cards/[id]/route.test.ts for why guard.ts is replaced
// wholesale rather than importOriginal()-ed.
vi.mock("../../../../../lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("../../../../../lib/core/catalogue", () => ({ setCatalogue: (...a: unknown[]) => setCatalogue(...a) }));
vi.mock("../../../../../lib/core/catalogue-index", () => ({
  searchCatalogue: (...a: unknown[]) => searchCatalogue(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const search = (query: URLSearchParams) =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/search?${query}`));

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  setCatalogue.mockResolvedValue({
    byNumber: {
      "1": { id: "base1-1", localId: "1", name: "Alakazam", image: "https://img/base1/1" },
      "01": { id: "base1-1", localId: "1", name: "Alakazam", image: "https://img/base1/1" },
      "4": { id: "base1-4", localId: "4", name: "Charizard", image: "https://img/base1/4" },
    },
    assetBase: "https://img/base1",
    setHasScans: true,
  });
});
afterEach(() => {
  setCatalogue.mockClear();
  searchCatalogue.mockClear();
});

describe("GET /api/v1/catalog/search", () => {
  it("refuses a set-less search with too short a query", async () => {
    const res = await search(new URLSearchParams({ query: "c" }));
    expect(res.status).toBe(400);
    expect(setCatalogue).not.toHaveBeenCalled();
    expect(searchCatalogue).not.toHaveBeenCalled();
  });

  it("refuses a set-less search with no query at all", async () => {
    const res = await search(new URLSearchParams());
    expect(res.status).toBe(400);
    expect(searchCatalogue).not.toHaveBeenCalled();
  });

  it("searches across every set when no set is given", async () => {
    searchCatalogue.mockResolvedValue([
      { id: "base1-4", number: "4", name: "Charizard", setName: "Base", image: null, imageHigh: null },
      { id: "swsh1-4", number: "4", name: "Charizard", setName: "Sword & Shield", image: null, imageHigh: null },
    ]);
    const res = await search(new URLSearchParams({ query: "char" }));
    expect(res.status).toBe(200);
    expect(searchCatalogue).toHaveBeenCalledWith("char", { limit: 60 });
    const { cards } = await res.json();
    expect(cards.map((c: { setName: string }) => c.setName)).toEqual(["Base", "Sword & Shield"]);
    expect(setCatalogue).not.toHaveBeenCalled();
  });

  it("refuses when authorisation refuses", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await search(new URLSearchParams({ set: "Base" }));
    expect(res.status).toBe(401);
  });

  it("dedupes the same card reached through two number forms", async () => {
    const res = await search(new URLSearchParams({ set: "Base" }));
    const { cards } = await res.json();
    expect(cards).toHaveLength(2);
    expect(cards.map((c: { id: string }) => c.id).sort()).toEqual(["base1-1", "base1-4"]);
  });

  it("filters by name, case-insensitively", async () => {
    const res = await search(new URLSearchParams({ set: "Base", query: "char" }));
    const { cards } = await res.json();
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("Charizard");
  });

  it("resolves an image URL from the catalogue's asset base", async () => {
    const res = await search(new URLSearchParams({ set: "Base", query: "char" }));
    const { cards } = await res.json();
    expect(cards[0].image).toContain("base1/4/low.webp");
    expect(cards[0].imageHigh).toContain("base1/4/high.webp");
  });
});
