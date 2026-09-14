import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shelfPrintings = vi.fn();
const writeTcgplayerPrices = vi.fn();
const writeCardPrices = vi.fn();
const usdToEurForRequest = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/core/catalogue/tcgcsv", () => ({
  TCGCSV_CATEGORY: { en: 3, ja: 85 },
  shelfPrintings: (...a: unknown[]) => shelfPrintings(...a),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  usdToEurForRequest: () => usdToEurForRequest(),
}));
vi.mock("@/lib/storage/postgres", () => ({
  writeTcgplayerPrices: (...a: unknown[]) => writeTcgplayerPrices(...a),
  writeCardPrices: (...a: unknown[]) => writeCardPrices(...a),
}));
vi.mock("@/lib/storage/supabase", () => ({
  adminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}));

const { GET } = await import("./route");

const get = (auth?: string) =>
  GET(
    new Request("https://api.cardorb.com/v1/cron/tcgplayer-prices", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

const MB = 1024 * 1024;
/** Base Set Charizard (base1-4): product 42382, and its Shadowless run, product 106999. */
const CHARIZARD = [
  { productId: 42382, printing: "holofoil", market: 1000 },
  { productId: 106999, printing: "unlimited-holofoil", market: 2000 },
  { productId: 106999, printing: "1st-edition-holofoil", market: 10000 },
];

let size: number | null;
let thin: { data: unknown; error: { message: string } | null } | Error;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  writeTcgplayerPrices.mockResolvedValue(undefined);
  writeCardPrices.mockResolvedValue(undefined);
  usdToEurForRequest.mockResolvedValue(0.9);
  size = 300 * MB;
  thin = { data: [], error: null };
  rpc.mockImplementation(async (name: string) => {
    if (name === "database_size_bytes") return { data: size, error: null };
    if (thin instanceof Error) throw thin;
    return thin;
  });
  shelfPrintings.mockResolvedValue({ rows: CHARIZARD, groups: 10, answered: 10 });
});

afterEach(() => {
  vi.useRealTimers();
});

const at = (iso: string) => vi.useFakeTimers({ now: new Date(iso), toFake: ["Date"] });
/** A Monday, after tcgcsv published. */
const monday = () => at("2026-09-14T21:15:00Z");

describe("GET /api/v1/cron/tcgplayer-prices", () => {
  it("refuses anyone but the cron", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    expect(shelfPrintings).not.toHaveBeenCalled();
  });

  it("writes the English shelf, dated today, and says how much", async () => {
    monday();
    shelfPrintings.mockResolvedValue({
      rows: [{ productId: 42382, printing: "holofoil", market: 112.5 }],
      groups: 10,
      answered: 10,
    });

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(shelfPrintings).toHaveBeenCalledWith(3);
    expect(writeTcgplayerPrices).toHaveBeenCalledWith(expect.anything(), [
      { product_id: 42382, printing: "holofoil", market: 112.5, updated_on: "2026-09-14" },
    ]);
    expect(await res.json()).toMatchObject({ ok: true, groups: 10, answered: 10, written: 1 });
  });

  it("writes nothing at all when most of the shelf did not answer, so yesterday's figures stand", async () => {
    shelfPrintings.mockResolvedValue({ rows: CHARIZARD, groups: 10, answered: 8 });

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(502);
    expect(writeTcgplayerPrices).not.toHaveBeenCalled();
    expect(writeCardPrices).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("writes today's history in euros, the Shadowless run under its own printings", async () => {
    monday();

    const res = await get("Bearer s3cret");

    expect(writeCardPrices).toHaveBeenCalledTimes(1);
    expect(writeCardPrices.mock.calls[0]?.[1]).toEqual([
      {
        tcgId: "base1-4",
        printing: "holofoil",
        date: "2026-09-14",
        price: 900,
        source: "tcgplayer",
      },
      {
        tcgId: "base1-4",
        printing: "shadowless-holofoil",
        date: "2026-09-14",
        price: 1800,
        source: "tcgplayer",
      },
      {
        tcgId: "base1-4",
        printing: "1st-edition-holofoil",
        date: "2026-09-14",
        price: 9000,
        source: "tcgplayer",
      },
    ]);
    expect(await res.json()).toMatchObject({
      ok: true,
      written: 3,
      history: { written: 3 },
      databaseBytes: 300 * MB,
    });
  });

  it("writes no history without a dollar rate, and still writes the latest prices", async () => {
    monday();
    usdToEurForRequest.mockResolvedValue(null);

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(writeTcgplayerPrices).toHaveBeenCalled();
    expect(writeCardPrices).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      ok: true,
      history: { written: 0, skipped: "no dollar rate" },
    });
  });

  it("at the ceiling on a weekday skips the history and still writes the latest prices", async () => {
    monday();
    size = 480 * MB;

    const res = await get("Bearer s3cret");

    expect(writeTcgplayerPrices).toHaveBeenCalled();
    expect(writeCardPrices).not.toHaveBeenCalled();
    expect((await res.json()).history).toEqual({
      written: 0,
      skipped: "database over the daily ceiling",
    });
  });

  it("counts a size nobody could read as over, and writes the history on a Saturday anyway", async () => {
    size = null;
    monday();
    const weekday = await (await get("Bearer s3cret")).json();
    expect(weekday.history.skipped).toBe("database size unknown");
    expect(writeCardPrices).not.toHaveBeenCalled();

    at("2026-09-19T21:15:00Z");
    const saturday = await (await get("Bearer s3cret")).json();
    expect(saturday.history).toEqual({ written: 3 });
    expect(writeCardPrices.mock.calls[0]?.[1][0].date).toBe("2026-09-19");
  });

  it("thins three months from before the first of the month six months back", async () => {
    monday();
    thin = {
      data: [
        { month: "2024-02-01", rows: 0 },
        { month: "2022-12-01", rows: 120 },
      ],
      error: null,
    };

    const res = await get("Bearer s3cret");

    expect(rpc).toHaveBeenCalledWith("thin_oldest_price_month", {
      p_before: "2026-03-01",
      p_months: 3,
    });
    expect((await res.json()).thinned).toEqual([
      { month: "2024-02-01", rows: 0 },
      { month: "2022-12-01", rows: 120 },
    ]);
  });

  it("finds the cutoff across a year", async () => {
    at("2026-02-10T21:15:00Z");

    await get("Bearer s3cret");

    expect(rpc).toHaveBeenCalledWith("thin_oldest_price_month", {
      p_before: "2025-08-01",
      p_months: 3,
    });
  });

  it("answers a failed thinning as null without failing the night", async () => {
    monday();
    thin = { data: null, error: { message: "canceling statement due to statement timeout" } };

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, thinned: null, history: { written: 3 } });
    expect(writeTcgplayerPrices).toHaveBeenCalled();

    thin = new Error("fetch failed");
    expect(await (await get("Bearer s3cret")).json()).toMatchObject({ ok: true, thinned: null });
  });
});
