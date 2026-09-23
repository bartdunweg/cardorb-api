import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How the market movers are read: the candidates out of Postgres, their lines through the same
 * reader every chart uses, the names and pictures in one read for the tiles, and the answer kept
 * under the price day and dropped by the nightly write.
 */

const cached = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, key: string[], opts: unknown) => {
    cached(key, opts);
    return fn;
  },
  revalidateTag: vi.fn(),
}));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: vi.fn(),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: vi.fn() }));
const marketMoverCandidates = vi.fn();
const listHistoryPrices = vi.fn();
const catalogueCardsById = vi.fn();
vi.mock("../../storage/postgres", () => ({
  marketMoverCandidates: (...a: unknown[]) => marketMoverCandidates(...a),
  listHistoryPrices: (...a: unknown[]) => listHistoryPrices(...a),
  catalogueCardsById: (...a: unknown[]) => catalogueCardsById(...a),
  listCardPrices: vi.fn(),
}));
/* The newest day in tcgplayer_prices, which every price cache here is keyed on (latestPriceDay). */
const ADMIN = {
  role: "service",
  from: () => ({
    select: () => ({
      order: () => ({ limit: async () => ({ data: [{ updated_on: "2026-09-22" }], error: null }) }),
    }),
  }),
};
const store = { admin: ADMIN as typeof ADMIN | null, configured: true };
vi.mock("../../storage/supabase", () => ({
  adminClient: () => store.admin,
  userClient: () => null,
  serverClient: async () => null,
  configured: () => store.configured,
}));
vi.mock("../../storage/collection", () => ({
  listRows: vi.fn(),
  cardsVersion: vi.fn(),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
  latestUsdEurRate: vi.fn(),
}));

const { getMarketMovers, priceHistoryTag } = await import("./collection");

const candidate = (tcgId: string, printing = "holofoil") => ({
  tcgId,
  printing,
  untilDay: "2026-09-22",
});
const line = (tcgId: string, was: number, now: number, printing = "holofoil") => [
  {
    language: "en",
    tcgId,
    date: "2026-09-15",
    market: null,
    holo: null,
    printings: { [printing]: was },
  },
  {
    language: "en",
    tcgId,
    date: "2026-09-22",
    market: null,
    holo: null,
    printings: { [printing]: now },
  },
];
const record = (id: string, name: string) => ({
  id,
  set_id: "sv1",
  local_id: id.split("-")[1],
  name,
  set_name: "Scarlet & Violet",
  series: null,
  release_date: null,
  rarity: null,
  types: [],
  image: `https://images.cardorb.com/en/sv1/${id.split("-")[1]}`,
  category: null,
  trainer_type: null,
  full_art: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.admin = ADMIN;
  store.configured = true;
  marketMoverCandidates.mockResolvedValue([candidate("sv1-1"), candidate("sv1-2")]);
  listHistoryPrices.mockResolvedValue([...line("sv1-1", 10, 30), ...line("sv1-2", 50, 40)]);
  catalogueCardsById.mockResolvedValue([record("sv1-1", "Sprigatito"), record("sv1-2", "Fuecoco")]);
});

describe("getMarketMovers", () => {
  it("answers each mover with what a tile needs, and nothing of anybody's", async () => {
    const out = await getMarketMovers();
    expect(out.failed).toBe(false);
    expect(out.up).toEqual([
      {
        tcgId: "sv1-1",
        printing: "holofoil",
        name: "Sprigatito",
        setName: "Scarlet & Violet",
        number: "1",
        printedNumber: "1",
        image: "https://images.cardorb.com/en/sv1/1/low.webp",
        was: 10,
        now: 30,
        change: 20,
        pct: 2,
        from: "2026-09-15",
        to: "2026-09-22",
      },
    ]);
    expect(out.down.map((m) => [m.tcgId, m.change])).toEqual([["sv1-2", -10]]);
  });

  it("reads the candidates' lines far enough back for the stray rule to weigh the window's first day", async () => {
    await getMarketMovers();
    // Told the price day, so Postgres does not have to find it.
    expect(marketMoverCandidates).toHaveBeenCalledWith(ADMIN, "2026-09-22", 7, 200);
    // The window opens 2026-09-15; thirty days of neighbours before it (STRAY_WINDOW_DAYS).
    expect(listHistoryPrices).toHaveBeenCalledWith(
      ADMIN,
      [
        { tcgId: "sv1-1", language: "en" },
        { tcgId: "sv1-2", language: "en" },
      ],
      "2026-08-16",
    );
  });

  it("reads the names and pictures of the tiles in one read, for the movers alone", async () => {
    marketMoverCandidates.mockResolvedValue([
      candidate("sv1-1"),
      candidate("sv1-1", "reverse-holofoil"),
      candidate("sv1-3"),
    ]);
    listHistoryPrices.mockResolvedValue([
      ...line("sv1-1", 10, 30),
      ...line("sv1-1", 10, 12, "reverse-holofoil"),
      // A candidate whose line ends where it began (as one the stray rule held does) is no mover,
      // and its name is not read.
      ...line("sv1-3", 10, 10),
    ]);
    await getMarketMovers();
    expect(catalogueCardsById).toHaveBeenCalledTimes(1);
    expect(catalogueCardsById).toHaveBeenCalledWith(ADMIN, ["sv1-1"], "en");
  });

  it("leaves out a mover the catalogue's copy has no card for, rather than a tile without a name", async () => {
    catalogueCardsById.mockResolvedValue([record("sv1-2", "Fuecoco")]);
    const out = await getMarketMovers();
    expect(out.up).toEqual([]);
    expect(out.down.map((m) => m.tcgId)).toEqual(["sv1-2"]);
  });

  it("is kept under the price day and dropped by the nightly price write", async () => {
    await getMarketMovers();
    const [key, opts] = cached.mock.calls.find(([k]) => k[0] === "market-movers")!;
    expect(key).toContain("2026-09-22");
    expect(opts).toMatchObject({ tags: [priceHistoryTag] });
  });

  /* The nightly cron fills the entry the moment it has written the day, and says which day it wrote
     rather than asking a memo that may still hold yesterday's. */
  it("reads and keeps under the day it is handed, where it is handed one", async () => {
    await getMarketMovers(7, "2026-09-23");
    expect(marketMoverCandidates).toHaveBeenCalledWith(ADMIN, "2026-09-23", 7, 200);
    const [key] = cached.mock.calls.find(([k]) => k[0] === "market-movers")!;
    expect(key).toContain("2026-09-23");
    expect(key).not.toContain("2026-09-22");
  });

  it("keeps one tile per card, at its biggest move, and names the printing", async () => {
    marketMoverCandidates.mockResolvedValue([
      candidate("sv1-1"),
      candidate("sv1-1", "reverse-holofoil"),
    ]);
    listHistoryPrices.mockResolvedValue([
      ...line("sv1-1", 10, 12),
      ...line("sv1-1", 10, 30, "reverse-holofoil"),
    ]);
    const out = await getMarketMovers();
    expect(out.up.map((m) => [m.tcgId, m.printing, m.name])).toEqual([
      ["sv1-1", "reverse-holofoil", "Sprigatito"],
    ]);
  });

  it("answers an empty catalogue as nothing moved, which is what it is", async () => {
    marketMoverCandidates.mockResolvedValue([]);
    const out = await getMarketMovers();
    expect(out).toEqual({ up: [], down: [], failed: false });
    expect(listHistoryPrices).not.toHaveBeenCalled();
  });

  it("says it failed when the candidates cannot be read", async () => {
    marketMoverCandidates.mockRejectedValue(new Error("permission denied"));
    expect(await getMarketMovers()).toEqual({ up: [], down: [], failed: true });
  });

  it("says it failed when the lines cannot be read", async () => {
    listHistoryPrices.mockRejectedValue(new Error("timeout"));
    expect((await getMarketMovers()).failed).toBe(true);
  });

  it("says it failed when the names cannot be read", async () => {
    catalogueCardsById.mockRejectedValue(new Error("timeout"));
    expect((await getMarketMovers()).failed).toBe(true);
  });

  it("says it failed on a database without the service role, rather than that nothing moved", async () => {
    store.admin = null;
    expect((await getMarketMovers()).failed).toBe(true);
    expect(marketMoverCandidates).not.toHaveBeenCalled();
  });
});
