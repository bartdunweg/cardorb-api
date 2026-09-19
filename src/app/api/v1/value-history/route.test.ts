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
  // The real helper's own contract, not a bare status: it is what turns a store
  // throw into `{ error: "<operation>." }` at 502, and guard.test.ts holds it to
  // that. A stub answering `new Response(null, …)` would let this route assert a
  // status while publishing no body at all.
  storeErrorResponse: (_err: unknown, _req: Request, operation: string) =>
    Response.json({ error: `${operation}.` }, { status: 502 }),
}));
vi.mock("@/lib/api/viewer", () => ({
  bearer: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
}));
const findFolder = vi.fn();
const getCollection = vi.fn();
const getListValue = vi.fn();
const getRecentValue = vi.fn();
const getEarlyValue = vi.fn();
vi.mock("@/lib/core/collection/collection", () => ({
  getValueHistory: (...a: unknown[]) => getValueHistory(...a),
  findFolder: (...a: unknown[]) => findFolder(...a),
  getCollection: (...a: unknown[]) => getCollection(...a),
  getListValue: (...a: unknown[]) => getListValue(...a),
  getRecentValue: (...a: unknown[]) => getRecentValue(...a),
  getEarlyValue: (...a: unknown[]) => getEarlyValue(...a),
}));

const flattenItems = vi.fn();
vi.mock("@/lib/core/collection/items", async (actual) => {
  const real = await actual<typeof import("@/lib/core/collection/items")>();
  flattenItems.mockImplementation(real.flattenItems);
  return {
    ...real,
    flattenItems: (...a: Parameters<typeof real.flattenItems>) => flattenItems(...a),
  };
});

const { GET } = await import("./route");
const { folderSeries } = await import("@/lib/core/collection/folder-history");
type CardItem = import("@/lib/core/collection/items").CardItem;

const VIEWER = { userId: "me-uuid", email: "me@example.com", username: "me" };

const SNAPSHOT = {
  date: "2026-08-06",
  value: 39_887,
  cards: 1524,
  priced: 1211,
  unpriced: 313,
};

/** A stored point a day, oldest first, ending on `last`: a history the cron has kept up with. */
const storedThrough = (last: string, days = 95) =>
  Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.parse(`${last}T00:00:00Z`) - (days - 1 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    value: 900 + i,
    cards: 1,
    priced: 1,
    unpriced: 0,
  }));

const get = (token = "t.o.k.e.n", query = "") =>
  GET(
    new Request(`https://cardorb.com/api/v1/value-history${query}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authorise.mockResolvedValue(VIEWER);
  getValueHistory.mockResolvedValue({ snapshots: [SNAPSHOT], failed: false });
  // Reset rather than left to whichever test ran last: clearAllMocks keeps an implementation.
  getCollection.mockResolvedValue({ sets: [], failed: false });
  getRecentValue.mockResolvedValue({ snapshots: [], failed: false });
  getEarlyValue.mockResolvedValue({ snapshots: [], failed: false });
});

describe("GET /api/v1/value-history, the recent days", () => {
  // Bart, 2026-09-15: a collection's value is its cards' prices added up, and moves with them.
  it("answers the recent days as the held cards' readings add up, after the stored points before them", async () => {
    vi.setSystemTime(new Date("2026-09-14T09:00:00Z"));
    getValueHistory.mockResolvedValue({
      snapshots: [
        { date: "2026-06-01", value: 900, cards: 1, priced: 1, unpriced: 0 },
        { date: "2026-09-13", value: 932, cards: 1, priced: 1, unpriced: 0 },
      ],
      failed: false,
    });
    const pikachu = {
      id: "row",
      tcgId: "svp-085",
      catalogue: "en",
      owned: true,
      finish: "normal",
      quantity: 1,
      acquiredAt: "2026-09-12T10:00:00Z",
    };
    getCollection.mockResolvedValue({ sets: [{ cards: [] }], failed: false });
    // The summed line, kept as a line (getRecentValue): the whole window of readings is past what
    // the Data Cache keeps, so it is not getCardPrices that answers here.
    getRecentValue.mockResolvedValue({
      snapshots: [
        { date: "2026-09-12", value: 932, cards: 1, priced: 1, unpriced: 0 },
        { date: "2026-09-13", value: 928, cards: 1, priced: 1, unpriced: 0 },
      ],
      failed: false,
    });
    flattenItems.mockReturnValueOnce([pikachu]);
    const body = await (await get()).json();
    // Two points in a ninety-day window leave every other day of it to be worked out, and the
    // earliest of those is where the working out starts (recentFrom).
    expect(getRecentValue).toHaveBeenCalledWith("me-uuid", [pikachu], "t.o.k.e.n", "2026-06-16");
    vi.useRealTimers();
    expect(body.snapshots.map((p: { date: string; value: number }) => [p.date, p.value])).toEqual([
      ["2026-06-01", 900],
      ["2026-09-12", 932],
      ["2026-09-13", 928],
    ]);
  });

  it("works out only the days the table has no point for", async () => {
    // The whole of this change: the stored points answer every day they cover, and the readings
    // are read for the days they do not. A history the cron kept up with leaves today alone.
    vi.setSystemTime(new Date("2026-09-18T09:00:00Z"));
    getValueHistory.mockResolvedValue({ snapshots: storedThrough("2026-09-17"), failed: false });
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([]);
    getRecentValue.mockResolvedValue({ snapshots: [], failed: false });
    await get();
    expect(getRecentValue).toHaveBeenCalledWith("me-uuid", [], "t.o.k.e.n", "2026-09-18");
    vi.useRealTimers();
  });

  it("works out the earliest night the cron missed, not just today", async () => {
    // A gap left standing would be a stored point drawn where none covers the day. The earliest
    // missing day is where the working out starts, so the gap is drawn from the readings.
    vi.setSystemTime(new Date("2026-09-18T09:00:00Z"));
    getValueHistory.mockResolvedValue({
      snapshots: storedThrough("2026-09-17").filter((p) => p.date !== "2026-09-16"),
      failed: false,
    });
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([]);
    getRecentValue.mockResolvedValue({ snapshots: [], failed: false });
    await get();
    expect(getRecentValue).toHaveBeenCalledWith("me-uuid", [], "t.o.k.e.n", "2026-09-16");
    vi.useRealTimers();
  });

  it("answers the stored points alone when the readings cannot be read", async () => {
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([]);
    getRecentValue.mockResolvedValue({ snapshots: [], failed: true });
    const body = await (await get()).json();
    expect(body.snapshots).toEqual([SNAPSHOT]);
    expect(getListValue).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/value-history, the days before the first stored point", () => {
  const point = (date: string, value: number) => ({
    date,
    value,
    cards: 1,
    priced: 1,
    unpriced: 0,
  });
  const solgaleo = {
    id: "row",
    tcgId: "sm12-216",
    catalogue: "en",
    owned: true,
    finish: "normal",
    quantity: 1,
    acquiredAt: "2026-09-17T10:00:00Z",
  };
  const wish = { ...solgaleo, id: "wish", tcgId: "sm12-1", owned: false };

  it("draws what the cards held now were worth before the first stored point, the stored points after", async () => {
    // pikachu, 2026-09-19: one card added 2026-09-17, two stored points, a two-point line on Home.
    vi.setSystemTime(new Date("2026-09-19T09:00:00Z"));
    getValueHistory.mockResolvedValue({
      snapshots: [point("2026-09-17", 281), point("2026-09-18", 281)],
      failed: false,
    });
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([solgaleo, wish]);
    getRecentValue.mockResolvedValue({ snapshots: [point("2026-09-19", 283)], failed: false });
    getEarlyValue.mockResolvedValue({
      // The early line as the cache hands it; a day it covers that a stored point covers too
      // loses to the stored point.
      snapshots: [point("2024-02-08", 150), point("2026-09-16", 279), point("2026-09-17", 1)],
      failed: false,
    });
    const body = await (await get()).json();
    vi.useRealTimers();
    // The owned copies alone, up to the first stored point.
    expect(getEarlyValue).toHaveBeenCalledWith("me-uuid", [solgaleo], "t.o.k.e.n", "2026-09-17");
    expect(body.snapshots.map((p: { date: string; value: number }) => [p.date, p.value])).toEqual([
      ["2024-02-08", 150],
      ["2026-09-16", 279],
      ["2026-09-17", 281],
      ["2026-09-18", 281],
      ["2026-09-19", 283],
    ]);
  });

  it("asks nothing for an account whose stored points already reach the first reading", async () => {
    // The owner's account: backfilled to 2024-02-08, so there is no day before it to work out.
    vi.setSystemTime(new Date("2026-09-19T09:00:00Z"));
    getValueHistory.mockResolvedValue({
      snapshots: [point("2024-02-08", 20_000), ...storedThrough("2026-09-18")],
      failed: false,
    });
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([solgaleo]);
    getRecentValue.mockResolvedValue({ snapshots: [], failed: false });
    await get();
    vi.useRealTimers();
    expect(getEarlyValue).not.toHaveBeenCalled();
  });

  it("cuts the early line where the recent days begin for an account with no stored point", async () => {
    vi.setSystemTime(new Date("2026-09-19T09:00:00Z"));
    getValueHistory.mockResolvedValue({ snapshots: [], failed: false });
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([solgaleo]);
    getRecentValue.mockResolvedValue({ snapshots: [point("2026-09-17", 281)], failed: false });
    getEarlyValue.mockResolvedValue({
      snapshots: [point("2026-09-16", 279), point("2026-09-17", 280), point("2026-09-18", 280)],
      failed: false,
    });
    const body = await (await get()).json();
    vi.useRealTimers();
    // Built to today, a key that holds for the day, and cut where the recent days begin.
    expect(getEarlyValue).toHaveBeenCalledWith("me-uuid", [solgaleo], "t.o.k.e.n", "2026-09-19");
    expect(body.snapshots.map((p: { date: string }) => p.date)).toEqual([
      "2026-09-16",
      "2026-09-17",
    ]);
  });

  it("answers the stored and recent points alone when only the early line fails", async () => {
    vi.setSystemTime(new Date("2026-09-19T09:00:00Z"));
    getValueHistory.mockResolvedValue({ snapshots: [point("2026-09-17", 281)], failed: false });
    getCollection.mockResolvedValue({ sets: [], failed: false });
    flattenItems.mockReturnValueOnce([solgaleo]);
    getRecentValue.mockResolvedValue({ snapshots: [point("2026-09-18", 282)], failed: false });
    getEarlyValue.mockRejectedValue(new Error("store down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get();
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect((await res.json()).snapshots.map((p: { date: string }) => p.date)).toEqual([
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(error).toHaveBeenCalledWith(
      "Early value line unavailable, the stored points alone:",
      expect.any(Error),
    );
    error.mockRestore();
  });
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
    getValueHistory.mockResolvedValue({ snapshots: [], failed: false });
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
    getValueHistory.mockResolvedValue({ snapshots: [], failed: false });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ snapshots: [] });
  });

  it("answers 503 when the readings could not be read, never an empty series", async () => {
    // The whole point of the change this guards: a collector with six hundred
    // readings and an unreachable store used to be handed the payload that
    // means "this account has never been snapshotted".
    getValueHistory.mockResolvedValue({ snapshots: [], failed: true });
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "The value history could not be read. Try again in a moment.",
    });
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
      language: null,
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
      // The line is built by folderSeries over these readings, as getListValue builds it.
      getListValue.mockImplementation(
        async (_user: string, items: CardItem[], list: "owned" | "wishlist") => ({
          snapshots: folderSeries(
            items,
            [
              {
                language: "en" as const,
                tcgId: "base1-25",
                date: "2026-09-01",
                market: 10,
                holo: null,
              },
              {
                language: "en" as const,
                tcgId: "base1-4",
                date: "2026-09-01",
                market: 100,
                holo: null,
              },
            ].filter((p) => items.some((it) => it.tcgId === p.tcgId)),
            list,
          ),
          failed: false,
        }),
      );
    });

    it("builds a manual folder's line from the copies filed in it", async () => {
      findFolder.mockResolvedValue({ id: FOLDER, rule: null });
      const body = await (await get("t.o.k.e.n", `?folder=${FOLDER}`)).json();
      expect(getValueHistory).not.toHaveBeenCalled();
      expect(getListValue).toHaveBeenCalledWith(
        "me-uuid",
        [expect.objectContaining({ tcgId: "base1-25", quantity: 2 })],
        "owned",
        "t.o.k.e.n",
      );
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

    it("values the wishlist from the wishes", async () => {
      getCollection.mockResolvedValue({
        sets: [
          {
            name: "base1",
            title: "Base Set",
            cards: [
              card("base1-25", [variant({ owned: false })]),
              card("base1-4", [variant({ id: "other" })]),
            ],
          },
        ],
        failed: false,
      });
      const body = await (await get("t.o.k.e.n", "?folder=wishlist")).json();
      expect(body.snapshots).toEqual([
        { date: "2026-09-01", value: 10, cards: 1, priced: 1, unpriced: 0 },
      ]);
    });

    it("answers 503 when the per-card readings could not be read", async () => {
      findFolder.mockResolvedValue({ id: FOLDER, rule: null });
      getListValue.mockResolvedValue({ snapshots: [], failed: true });
      const res = await get("t.o.k.e.n", `?folder=${FOLDER}`);
      expect(res.status).toBe(503);
    });

    it("answers a store that threw looking for the folder in the { error } shape", async () => {
      // Unwrapped, this reached Next's generic 500: not in the contract and not
      // the shape either client branches on. The identical call in
      // cards/route.ts was already wrapped.
      findFolder.mockRejectedValue(new Error("PostgREST said no"));
      const res = await get("t.o.k.e.n", `?folder=${FOLDER}`);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "Reading the folder failed." });
    });

    it("is a 404 for an id that is no folder, and a 400 for a value that is no id", async () => {
      findFolder.mockResolvedValue(null);
      expect((await get("t.o.k.e.n", `?folder=${FOLDER}`)).status).toBe(404);
      expect((await get("t.o.k.e.n", "?folder=all")).status).toBe(400);
    });
  });
});
