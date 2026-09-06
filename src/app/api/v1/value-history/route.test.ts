import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Whose value history, asked out loud.
 *
 * This route used to import a committed JSON file and hand the identical series
 * to every authenticated caller — one account's holdings, read by all of them.
 * The assertions below are the ones that would have failed then: the userId
 * reaching the store is the caller's, two callers do not get the same answer,
 * and the shape the iOS app parses has not moved.
 */

const authorise = vi.fn();
const getValueHistory = vi.fn();

// The real guard.ts pulls in lib/api/viewer.ts, which is `import "server-only"`
// — fine under Next's bundler, fatal under plain vitest. Replaced wholesale,
// like every other route test here.
vi.mock("@/lib/api/guard", () => ({
  authorise: (...a: unknown[]) => authorise(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
const findFolder = vi.fn();
const getCollection = vi.fn();
const getCardPrices = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  getValueHistory: (...a: unknown[]) => getValueHistory(...a),
  findFolder: (...a: unknown[]) => findFolder(...a),
  getCollection: (...a: unknown[]) => getCollection(...a),
  getCardPrices: (...a: unknown[]) => getCardPrices(...a),
}));

const { GET } = await import("./route");

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const SNAPSHOT = {
  date: "2026-08-06",
  value: 39_887,
  cards: 1524,
  priced: 1211,
  unpriced: 313,
};

const get = (token = "t.o.k.e.n", query = "") =>
  GET(
    new Request(`https://cardorb.com/api/v1/value-history${query}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getValueHistory.mockResolvedValue([SNAPSHOT]);
});

describe("GET /api/v1/value-history", () => {
  it("asks for the caller's own history, with the caller's own credential", async () => {
    await get();
    // The token as well as the id: this table's only policy is
    // `user_id = auth.uid()`, so a client that names nobody gets nothing.
    expect(getValueHistory).toHaveBeenCalledWith("me-uuid", "t.o.k.e.n");
  });

  it("does not hand one account another's series", async () => {
    authorise.mockResolvedValue({ ...VIEWER, userId: "someone-else" });
    getValueHistory.mockResolvedValue([]);
    const body = await (await get()).json();
    expect(getValueHistory).toHaveBeenCalledWith("someone-else", "t.o.k.e.n");
    expect(body).toEqual({ snapshots: [] });
  });

  it("keeps the shape the iOS app parses", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ snapshots: [SNAPSHOT] });
  });

  it("answers an account that has never been snapshotted with an empty series", async () => {
    // Not a 404 and not an error: having no history is the ordinary state of
    // every account but one, and the card draws nothing for it.
    getValueHistory.mockResolvedValue([]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ snapshots: [] });
  });

  it("passes a refusal through rather than turning it into an empty 200", async () => {
    authorise.mockResolvedValue({ status: 401, error: "Who are you?" });
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Who are you?" });
    expect(getValueHistory).not.toHaveBeenCalled();
  });

  describe("?folder", () => {
    const FOLDER = "11111111-1111-4111-8111-111111111111";
    // The assembly's shape: a card with its printings, each a row.
    const variant = (over: Record<string, unknown>) => ({
      id: "row",
      owned: true,
      finish: null,
      quantity: 1,
      isFavorite: false,
      collectionId: null,
      rarity: null,
      condition: null,
      grade: null,
      purchasePrice: null,
      purchaseDate: null,
      notes: null,
      acquiredAt: null,
      ...over,
    });
    const card = (tcgId: string, variants: unknown[]) => ({
      name: "Pikachu",
      number: "25",
      gen: null,
      type: null,
      image: null,
      imageHigh: null,
      speciesId: 25,
      tcgId,
      price: null,
      priceHolo: null,
      variants,
    });

    beforeEach(() => {
      getCollection.mockResolvedValue({
        sets: [
          {
            name: "base1",
            title: "Base Set",
            cards: [
              card("base1-25", [variant({ collectionId: FOLDER, quantity: 2 })]),
              card("base1-4", [variant({ id: "other", isFavorite: true })]),
            ],
          },
        ],
        failed: false,
      });
      getCardPrices.mockResolvedValue([
        { tcgId: "base1-25", date: "2026-09-01", market: 10, holo: null },
        { tcgId: "base1-4", date: "2026-09-01", market: 100, holo: null },
      ]);
    });

    it("builds a manual folder's line from the copies filed in it", async () => {
      findFolder.mockResolvedValue({ id: FOLDER, rule: null });
      const body = await (await get("t.o.k.e.n", `?folder=${FOLDER}`)).json();
      expect(getValueHistory).not.toHaveBeenCalled();
      expect(getCardPrices).toHaveBeenCalledWith("me-uuid", ["base1-25"], "t.o.k.e.n");
      expect(body).toEqual({
        snapshots: [{ date: "2026-09-01", value: 20, cards: 2, priced: 2, unpriced: 0 }],
      });
    });

    it("answers favorites from the starred copies", async () => {
      const body = await (await get("t.o.k.e.n", "?folder=favorites")).json();
      expect(findFolder).not.toHaveBeenCalled();
      expect(body.snapshots).toEqual([
        { date: "2026-09-01", value: 100, cards: 1, priced: 1, unpriced: 0 },
      ]);
    });

    it("is a 404 for an id that is no folder, and a 400 for a value that is no id", async () => {
      findFolder.mockResolvedValue(null);
      expect((await get("t.o.k.e.n", `?folder=${FOLDER}`)).status).toBe(404);
      expect((await get("t.o.k.e.n", "?folder=all")).status).toBe(400);
    });
  });
});
