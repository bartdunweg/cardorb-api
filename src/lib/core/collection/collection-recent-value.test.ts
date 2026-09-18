import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardItem } from "./items";

/**
 * The Home line is kept, not the readings it is summed from.
 *
 * Production, 2026-09-16: `Failed to set Next.js data cache for unstable_cache /v1/value-history,
 * items over 2MB can not be cached (22309913 bytes)`, and the route took nine seconds on every
 * visit. What goes into the cache here is the summed line, a point a day.
 */

const unstable_cache = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: (...a: unknown[]) => unstable_cache(...a),
  revalidateTag: vi.fn(),
}));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: vi.fn(),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: vi.fn() }));
const listHistoryPrices = vi.fn();
vi.mock("../../storage/postgres", () => ({
  listCardPrices: vi.fn(),
  listHistoryPrices: (...a: unknown[]) => listHistoryPrices(...a),
}));
vi.mock("../../storage/supabase", () => ({
  adminClient: () => ({}),
  userClient: () => ({ user: true }),
  serverClient: async () => ({ server: true }),
}));
vi.mock("../../storage/collection", () => ({
  listRows: vi.fn(),
  cardsVersion: vi.fn(),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
}));

const { getRecentValue } = await import("./collection");

const pikachu = {
  id: "row",
  tcgId: "svp-085",
  catalogue: "en",
  owned: true,
  finish: "normal",
  edition: null,
  quantity: 1,
  acquiredAt: "2026-09-12T10:00:00Z",
} as unknown as CardItem;

beforeEach(() => {
  vi.clearAllMocks();
  // Runs the callback straight through, and hands the key and options out for the assertions.
  unstable_cache.mockImplementation((fn: () => unknown) => fn);
  listHistoryPrices.mockResolvedValue([
    { language: "en", tcgId: "svp-085", date: "2026-09-12", market: 932, holo: null },
    { language: "en", tcgId: "svp-085", date: "2026-09-13", market: 928, holo: null },
  ]);
});

describe("getRecentValue", () => {
  it("caches the summed line, under the readings' tags and the cards' tag", async () => {
    const { snapshots, failed } = await getRecentValue("me", [pikachu], "token", "2026-09-12");
    expect(failed).toBe(false);
    expect(snapshots.map((p) => [p.date, p.value])).toEqual([
      ["2026-09-12", 932],
      ["2026-09-13", 928],
    ]);
    const [, key, options] = unstable_cache.mock.calls[0] as [
      unknown,
      string[],
      { tags: string[] },
    ];
    expect(key[0]).toBe("recent-value");
    expect(key).toContain("me");
    expect(options.tags).toEqual(["card-prices:me", "card-prices", "cards:me"]);
    // The parallel read, over the held cards, from CARRY_DAYS + 1 before the first day wanted.
    const [, cards, from] = listHistoryPrices.mock.calls[0] as [unknown, unknown, string];
    expect(cards).toEqual([{ tcgId: "svp-085", language: "en" }]);
    expect(from).toBe("2026-08-28");
  });

  it("keys on what is held, so a copy that changed count is another line", async () => {
    await getRecentValue("me", [pikachu], "token", "2026-09-12");
    await getRecentValue("me", [{ ...pikachu, quantity: 2 }], "token", "2026-09-12");
    const keyOf = (n: number) => (unstable_cache.mock.calls[n] as [unknown, string[]])[1].join("/");
    expect(keyOf(0)).not.toBe(keyOf(1));
  });

  it("reads nothing for a collection with no priced card", async () => {
    const out = await getRecentValue("me", [{ ...pikachu, owned: false }], "token", "2026-09-12");
    expect(out).toEqual({ snapshots: [], failed: false });
    expect(listHistoryPrices).not.toHaveBeenCalled();
  });

  it("says so when the readings cannot be read, rather than an empty line", async () => {
    listHistoryPrices.mockRejectedValue(new Error("down"));
    const out = await getRecentValue("me", [pikachu], "token", "2026-09-12");
    expect(out).toEqual({ snapshots: [], failed: true });
  });
});

describe("the tail alone", () => {
  /**
   * Home read ninety days of readings to draw over stored points that already said the same
   * figures: 144,574 readings, 1,678 ms of them in production on 2026-09-17. Only the days the
   * table has no point for are worked out now, and the days read before them are context, not
   * answer: a card with no reading today is priced at its last one, up to CARRY_DAYS old.
   */
  it("answers from `since` on, although it reads the fortnight before it", async () => {
    const { snapshots } = await getRecentValue("me", [pikachu], "token", "2026-09-13");
    expect(snapshots.map((p) => p.date)).toEqual(["2026-09-13"]);
    const [, , from] = listHistoryPrices.mock.calls[0] as [unknown, unknown, string];
    expect(from).toBe("2026-08-29");
  });

  it("keys on the first day wanted, so yesterday's tail is not today's", async () => {
    await getRecentValue("me", [pikachu], "token", "2026-09-12");
    await getRecentValue("me", [pikachu], "token", "2026-09-13");
    const keyOf = (n: number) => (unstable_cache.mock.calls[n] as [unknown, string[]])[1];
    expect(keyOf(0)).toContain("2026-09-12");
    expect(keyOf(1)).toContain("2026-09-13");
    expect(keyOf(0).join("/")).not.toBe(keyOf(1).join("/"));
  });
});
