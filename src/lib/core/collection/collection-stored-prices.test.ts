import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The collection's prices out of tcgplayer_prices instead of a TCGdex request per card.
 *
 * Two things matter. A stored figure is chosen by exactly the rules a relayed one was, so a card
 * shows the same printing's price it did; and TCGdex still answers wherever the store cannot,
 * so a night the cron did not run is never a collection without prices.
 */

const pricesFor = vi.fn(
  async (ids: string[]) => new Map(ids.map((id) => [id, { usd: { market: 1 } }])),
);
const readTcgplayerPrices = vi.fn();
let current: { data: unknown[] | null; error: unknown } = {
  data: [{ product_id: 1 }],
  error: null,
};

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("../catalogue/tcgdex-client", async (real) => ({
  ...(await real<typeof import("../catalogue/tcgdex-client")>()),
  pricesFor: (ids: string[]) => pricesFor(ids),
}));
vi.mock("../../storage/supabase", () => ({
  // Just enough of a client for the one "is anything current" look.
  adminClient: () => ({
    from: () => ({ select: () => ({ gte: () => ({ limit: async () => current }) }) }),
  }),
  serverClient: async () => ({}),
  userClient: () => ({}),
}));
vi.mock("../../storage/postgres", () => ({
  listCardPrices: vi.fn(),
  readTcgplayerPrices: (...a: unknown[]) => readTcgplayerPrices(...a),
}));

const { pricesFromStoredRows, storedPricesFor } = await import("./collection");

// Base Set Blastoise and Base Set 2's card 50, with the product ids tcgplayer-ids.generated.json
// links them to, so the lookup the reader makes is the one production makes.
const BLASTOISE = "base1-4";
const TWO_RUNS = "base2-50";

beforeEach(() => {
  vi.clearAllMocks();
  current = { data: [{ product_id: 1 }], error: null };
});

describe("pricesFromStoredRows", () => {
  it("reads a stored shelf the way TCGdex's relayed figures were read", () => {
    const out = pricesFromStoredRows(
      [
        [BLASTOISE, 42382],
        [TWO_RUNS, 45153],
      ],
      [
        { product_id: 42382, printing: "holofoil", market: "112.50" },
        { product_id: 45153, printing: "unlimited", market: 2.24 },
        { product_id: 45153, printing: "1st-edition", market: 10.89 },
      ],
    );

    expect(out.get(BLASTOISE)).toEqual({
      usd: { market: 112.5, productId: 42382 },
      usdFirstEd: null,
      usdPrintings: { holofoil: { market: 112.5, productId: 42382 } },
    });
    // The unlimited run is the card's price and the stamped run its own, as usdOf and
    // usdFirstEdOf pick them off TCGdex's record.
    expect(out.get(TWO_RUNS)?.usd?.market).toBe(2.24);
    expect(out.get(TWO_RUNS)?.usdFirstEd?.market).toBe(10.89);
    expect(Object.keys(out.get(TWO_RUNS)?.usdPrintings ?? {}).sort()).toEqual([
      "1st-edition",
      "unlimited",
    ]);
  });

  it("leaves out a card whose product has no stored figure, and one with no product", () => {
    const out = pricesFromStoredRows(
      [
        [BLASTOISE, 42382],
        ["nowhere-001", null],
      ],
      [],
    );
    expect(out.size).toBe(0);
  });
});

describe("storedPricesFor", () => {
  it("prices linked cards from the store and asks TCGdex only for a card with no link", async () => {
    readTcgplayerPrices.mockResolvedValue([
      { product_id: 42382, printing: "holofoil", market: 112.5, updated_on: "2026-09-14" },
    ]);

    const out = await storedPricesFor([BLASTOISE, "nowhere-001"]);

    expect(readTcgplayerPrices).toHaveBeenCalledWith(
      expect.anything(),
      [42382],
      expect.any(String),
    );
    expect(pricesFor).toHaveBeenCalledTimes(1);
    expect(pricesFor).toHaveBeenCalledWith(["nowhere-001"]);
    expect(out.get(BLASTOISE)?.usd?.market).toBe(112.5);
    expect(out.has("nowhere-001")).toBe(true);
  });

  it("asks TCGdex for every card while the store holds nothing current", async () => {
    current = { data: [], error: null };
    // A different day's window, so the remembered answer from the test before does not apply.
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    try {
      await storedPricesFor([BLASTOISE, TWO_RUNS]);
      expect(readTcgplayerPrices).not.toHaveBeenCalled();
      expect(pricesFor).toHaveBeenCalledWith([BLASTOISE, TWO_RUNS]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks TCGdex for every card when the store cannot be read", async () => {
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    try {
      readTcgplayerPrices.mockRejectedValue(new Error("connection reset"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      await storedPricesFor([BLASTOISE]);
      expect(pricesFor).toHaveBeenCalledWith([BLASTOISE]);
    } finally {
      vi.useRealTimers();
    }
  });
});
