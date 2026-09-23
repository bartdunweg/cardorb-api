import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which client reads a price line. `anon` has no grant on card_price_months, so a reader who
 * named nobody read it as `anon`, was refused, and every open route drew "could not be loaded"
 * (the set page's changes since #584, the card sheet's line). Such a reader reads through the
 * service role; a named reader, bearer or cookie, still reads as themselves.
 */

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: vi.fn(),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: vi.fn() }));
const listCardPrices = vi.fn();
vi.mock("../../storage/postgres", () => ({
  listCardPrices: (...a: unknown[]) => listCardPrices(...a),
  listHistoryPrices: vi.fn(),
}));
/* Three clients told apart, so the test says which one the read went through. */
const ADMIN = { role: "service" };
const USER = { role: "bearer" };
const SERVER = { role: "cookie" };
vi.mock("../../storage/supabase", () => ({
  adminClient: () => ADMIN,
  userClient: () => USER,
  serverClient: async () => SERVER,
}));
vi.mock("../../storage/collection", () => ({
  listRows: vi.fn(),
  cardsVersion: vi.fn(),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
}));

const { getCardPrices } = await import("./collection");

const CARDS = [{ tcgId: "base1-4", language: "en" as const }];
const dbOfLastRead = () => listCardPrices.mock.calls.at(-1)![0];

beforeEach(() => {
  vi.clearAllMocks();
  listCardPrices.mockResolvedValue([]);
});

describe("getCardPrices, by reader", () => {
  it("reads through the service role for a reader who named nobody", async () => {
    const out = await getCardPrices("catalogue", CARDS, undefined, "2026-09-01", "nobody");
    expect(out.failed).toBe(false);
    expect(dbOfLastRead()).toBe(ADMIN);
    /* The service role passes RLS by, so the read has to be scoped by what it asks: these ids. */
    expect(listCardPrices.mock.calls.at(-1)![1]).toEqual(CARDS);
  });

  it("reads as the named reader, by bearer or by cookie, and never as the service role", async () => {
    await getCardPrices("me-uuid", CARDS, "t.o.k.e.n", "2026-09-01");
    expect(dbOfLastRead()).toBe(USER);
    /* A cookie-only caller has no token and is still somebody: no token is not "nobody". */
    await getCardPrices("me-uuid", CARDS, undefined, "2026-09-01");
    expect(dbOfLastRead()).toBe(SERVER);
  });
});
