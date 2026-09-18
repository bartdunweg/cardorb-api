import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardItem } from "./items";

/**
 * A binder's, the favourites' or the wishlist's line is kept, not the readings it is summed from.
 *
 * The Pokédex binder's ninety days of readings are 17.8 MB, Kanto's 7.1 MB: past the Data Cache's
 * 2 MB an entry, so getCardPrices never kept them and `/v1/value-history?folder=` read and summed
 * them again on every visit, 3.2 s for the Pokédex binder (measured locally against production,
 * 2026-09-18). What goes into the cache here is the line, a point a day, keyed on every field of a
 * copy the line reads.
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

const { getListValue } = await import("./collection");

const pikachu = {
  id: "row",
  tcgId: "svp-085",
  catalogue: "en",
  owned: true,
  finish: "normal",
  edition: null,
  quantity: 1,
  acquiredAt: null,
} as unknown as CardItem;
const wish = { ...pikachu, id: "wish", tcgId: "svp-086", owned: false } as CardItem;

const keyOf = (n: number) => (unstable_cache.mock.calls[n] as [unknown, string[]])[1].join("/");

beforeEach(() => {
  vi.clearAllMocks();
  unstable_cache.mockImplementation((fn: () => unknown) => fn);
  listHistoryPrices.mockResolvedValue([
    { language: "en", tcgId: "svp-085", date: "2026-09-12", market: 932, holo: null },
    { language: "en", tcgId: "svp-086", date: "2026-09-12", market: 5, holo: null },
    { language: "en", tcgId: "svp-085", date: "2026-09-13", market: 928, holo: null },
  ]);
});

describe("getListValue", () => {
  it("caches the line, under the readings' tags and the cards' tag", async () => {
    const { snapshots, failed } = await getListValue("me", [pikachu, wish], "owned", "token");
    expect(failed).toBe(false);
    expect(snapshots).toEqual([
      { date: "2026-09-12", value: 932, cards: 1, priced: 1, unpriced: 0 },
      { date: "2026-09-13", value: 928, cards: 1, priced: 1, unpriced: 0 },
    ]);
    const [, key, options] = unstable_cache.mock.calls[0] as [
      unknown,
      string[],
      { tags: string[] },
    ];
    expect(key[0]).toBe("list-value");
    expect(key).toContain("me");
    expect(options.tags).toEqual(["card-prices:me", "card-prices", "cards:me"]);
    // Every card of the list is read, as the route read them: a wish's reading is a day with a point.
    const [, cards] = listHistoryPrices.mock.calls[0] as [unknown, unknown];
    expect(cards).toEqual([
      { tcgId: "svp-085", language: "en" },
      { tcgId: "svp-086", language: "en" },
    ]);
  });

  it("values the wishes for the wishlist", async () => {
    const { snapshots } = await getListValue("me", [pikachu, wish], "wishlist", "token");
    expect(snapshots.map((p) => [p.date, p.value, p.cards])).toEqual([
      ["2026-09-12", 5, 1],
      // Its last reading stands for a day without one (CARRY_DAYS).
      ["2026-09-13", 5, 1],
    ]);
  });

  it("keys on every field of a copy the line reads", async () => {
    const lists: [CardItem[], "owned" | "wishlist"][] = [
      [[pikachu], "owned"],
      [[{ ...pikachu, quantity: 2 }], "owned"],
      [[{ ...pikachu, finish: "reverse-holo" }], "owned"],
      [[{ ...pikachu, edition: "1st-edition" }], "owned"],
      [[{ ...pikachu, owned: false }], "owned"],
      [[{ ...pikachu, catalogue: "ja" }], "owned"],
      [[pikachu, wish], "owned"],
      [[pikachu], "wishlist"],
    ];
    for (const [items, list] of lists) await getListValue("me", items, list, "token");
    const keys = lists.map((_l, n) => keyOf(n));
    expect(new Set(keys).size).toBe(lists.length);
    // And not on what it does not read: the same copies in another order are the same line.
    await getListValue("me", [wish, pikachu], "owned", "token");
    expect(keyOf(lists.length)).toBe(keys[6]);
  });

  it("reads nothing for a list with no priced card", async () => {
    const out = await getListValue("me", [{ ...pikachu, tcgId: null }], "owned", "token");
    expect(out).toEqual({ snapshots: [], failed: false });
    expect(listHistoryPrices).not.toHaveBeenCalled();
  });

  it("says so when the readings cannot be read, rather than an empty line", async () => {
    listHistoryPrices.mockRejectedValue(new Error("down"));
    const out = await getListValue("me", [pikachu], "owned", "token");
    expect(out).toEqual({ snapshots: [], failed: true });
  });
});
