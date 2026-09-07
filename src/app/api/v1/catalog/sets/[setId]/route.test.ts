import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorise = vi.fn();
const findSet = vi.fn();
const setCards = vi.fn();
const getRows = vi.fn();
const guidePricesFor = vi.fn();

/* Same three server-only modules replaced wholesale as in the sibling route's
   test; the ownership join is the real, pure one. */
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => null }));
vi.mock("@/lib/core/collection/collection", () => ({
  getRows: (...a: unknown[]) => getRows(...a),
  guidePricesFor: (...a: unknown[]) => guidePricesFor(...a),
}));
vi.mock("@/lib/core/catalogue/ptcg-browse", () => ({
  findSet: (...a: unknown[]) => findSet(...a),
  setCards: (...a: unknown[]) => setCards(...a),
}));
/* The TCGdex scan swap is a real network call through setCatalogue() and has
   its own tests; here it would only make these ones depend on a second host
   being up. Replaced with the identity it degrades to when TCGdex is silent. */
vi.mock("@/lib/core/catalogue/browse-artwork", () => ({
  withTcgdexScans: (_set: unknown, cards: unknown) => cards,
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

const card = (number: string, name = "Bulbasaur") => ({
  id: `base1-${number}`,
  number,
  name,
  setName: "Base",
  image: null,
  imageHigh: null,
  rarity: null,
  types: [],
});

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

const open = (query = "", setId = "base1") =>
  GET(new Request(`https://cardorb.com/api/v1/catalog/sets/${setId}?${query}`), {
    params: Promise.resolve({ setId }),
  });

beforeEach(() => {
  authorise.mockResolvedValue(VIEWER);
  findSet.mockResolvedValue(SET);
  setCards.mockResolvedValue([card("1"), card("2"), card("4", "Charizard")]);
  getRows.mockResolvedValue({ rows: [], failed: false });
  guidePricesFor.mockResolvedValue(new Map());
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/catalog/sets/[setId]", () => {
  it("refuses when authorisation refuses, without asking the catalogue", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Sign in to see this." });
    const res = await open();
    expect(res.status).toBe(401);
    expect(findSet).not.toHaveBeenCalled();
  });

  it("404s an id nobody carries, without asking for its cards", async () => {
    findSet.mockResolvedValue(null);
    const res = await open("", "nope");
    expect(res.status).toBe(404);
    expect(setCards).not.toHaveBeenCalled();
  });

  it("answers the whole set with the viewer's cards marked", async () => {
    getRows.mockResolvedValue({ rows: [row({ quantity: 3 })], failed: false });
    const body = await (await open()).json();

    expect(body.set).toMatchObject({ id: "base1", name: "Base" });
    expect(body.totalCount).toBe(3);
    expect(body.ownedCount).toBe(1);
    expect(body.cards.map((c: { owned: boolean }) => c.owned)).toEqual([false, false, true]);
    expect(body.cards[2]).toMatchObject({ quantity: 3, itemIds: ["row-1"] });
  });

  it("prices the page's cards, and asks after those cards only", async () => {
    getRows.mockResolvedValue({ rows: [], failed: false });
    guidePricesFor.mockResolvedValue(
      new Map([["base1-4", { price: { market: 340 }, holo: null }]]),
    );
    const body = await (await open()).json();

    const charizard = body.cards.find((c: { id: string }) => c.id === "base1-4");
    expect(charizard.price).toEqual({ market: 340 });
    expect(charizard.priceHolo).toBeNull();
    // A card the guide does not price is a blank line, not a missing field.
    expect(body.cards.find((c: { id: string }) => c.id !== "base1-4").price).toBeNull();
  });

  it("prices only the page it returns, not the whole set", async () => {
    getRows.mockResolvedValue({ rows: [], failed: false });
    guidePricesFor.mockResolvedValue(new Map());
    await open("pageSize=1");

    // 250 lookups for a page of one is the cost this route was careful not to pay.
    expect(guidePricesFor).toHaveBeenLastCalledWith(expect.objectContaining({ length: 1 }));
  });

  it("counts owned over the whole set rather than over the page", async () => {
    getRows.mockResolvedValue({ rows: [row()], failed: false });
    const body = await (await open("pageSize=1")).json();

    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].owned).toBe(false);
    /* The Charizard is on page 3, and the header still has to say 1 of 3. */
    expect(body.ownedCount).toBe(1);
    expect(body.totalCount).toBe(3);
  });

  it("pages, and says whether there is more", async () => {
    const first = await (await open("pageSize=2")).json();
    expect(first.cards.map((c: { number: string }) => c.number)).toEqual(["1", "2"]);
    expect(first).toMatchObject({ page: 1, pageSize: 2, hasMore: true });

    const second = await (await open("page=2&pageSize=2")).json();
    expect(second.cards.map((c: { number: string }) => c.number)).toEqual(["4"]);
    expect(second).toMatchObject({ page: 2, hasMore: false });
  });

  it("answers an empty page past the end rather than wrapping round", async () => {
    const body = await (await open("page=9&pageSize=2")).json();
    expect(body.cards).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(body.totalCount).toBe(3);
  });

  it("falls back to the default page and size for nonsense values", async () => {
    const body = await (await open("page=-1&pageSize=0")).json();
    expect(body).toMatchObject({ page: 1, pageSize: 60 });
  });

  it("caps pageSize at the catalogue's own maximum", async () => {
    expect((await (await open("pageSize=5000")).json()).pageSize).toBe(250);
  });

  it("answers 502 with a sentence a client can show when the catalogue refused", async () => {
    setCards.mockRejectedValue(new Error("pokemontcg.io set base1 unavailable"));
    const res = await open();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("The catalogue did not answer. Try again in a moment.");
  });

  it("still serves the set when the collection could not be read, and says so", async () => {
    getRows.mockResolvedValue({ rows: [], failed: true });
    const body = await (await open()).json();

    expect(body.totalCount).toBe(3);
    expect(body.ownedCount).toBe(0);
    expect(body.collectionUnavailable).toBe(true);
  });
});
