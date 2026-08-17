import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const listSets = vi.fn();
const getRows = vi.fn();

/* guard.ts, viewer.ts and collection.ts are all `import "server-only"`
   underneath, which throws the moment vitest imports them — see
   app/api/v1/catalog/search/route.test.ts, whose pattern this follows. The
   ownership join itself is the real one: it is pure, and the point of these
   tests is what the route does with it. */
vi.mock("../../../../../lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("../../../../../lib/api/viewer", () => ({ bearer: () => null }));
vi.mock("../../../../../lib/core/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
}));
vi.mock("../../../../../lib/core/ptcg-browse", () => ({
  listSets: (...a: unknown[]) => listSets(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const SET = {
  id: "base1",
  name: "Base",
  series: "Base",
  releaseDate: "1999/01/09",
  total: 102,
  printedTotal: 102,
  logo: null,
  symbol: null,
};

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
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  ...over,
});

const sets = () => GET(new Request("https://cardorb.com/api/v1/catalog/sets"));

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  listSets.mockResolvedValue([SET]);
  getRows.mockResolvedValue({ rows: [], failed: false });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/catalog/sets", () => {
  it("refuses when authorisation refuses, without asking the catalogue", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await sets();
    expect(res.status).toBe(401);
    expect(listSets).not.toHaveBeenCalled();
  });

  it("returns every set with the viewer's own counts attached", async () => {
    getRows.mockResolvedValue({ rows: [row(), row({ id: "b", owned: false })], failed: false });
    const res = await sets();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0]).toMatchObject({
      id: "base1",
      total: 102,
      ownedCount: 1,
      wishlistCount: 1,
    });
  });

  it("returns zero counts for a set nothing is filed under", async () => {
    getRows.mockResolvedValue({ rows: [row({ setName: "Jungle" })], failed: false });
    const { sets: out } = await (await sets()).json();
    expect(out[0]).toMatchObject({ ownedCount: 0, wishlistCount: 0 });
  });

  it("answers 502 with a distinct error when the catalogue refused", async () => {
    listSets.mockRejectedValue(new Error("pokemontcg.io set list unavailable"));
    const res = await sets();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("catalog-unavailable");
    /* The shelf failed, so there was no reason to read the collection. */
    expect(getRows).not.toHaveBeenCalled();
  });

  it("still serves the shelf when the collection could not be read, and says so", async () => {
    getRows.mockResolvedValue({ rows: [], failed: true });
    const res = await sets();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sets[0]).toMatchObject({ ownedCount: 0 });
    /* Without this a client cannot tell "you own none of these" from "we could
       not find out", which are different sentences to put on a screen. */
    expect(body.collectionUnavailable).toBe(true);
  });

  it("says nothing about availability on the ordinary path", async () => {
    expect(await (await sets()).json()).not.toHaveProperty("collectionUnavailable");
  });
});
