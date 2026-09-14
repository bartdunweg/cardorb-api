import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shelfPrintings = vi.fn();
const writeTcgplayerPrices = vi.fn();
const writeCardPrices = vi.fn();
const usdToEurForRequest = vi.fn();
const fetchUsdToEur = vi.fn();
const writeUsdEurRate = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/core/catalogue/tcgcsv", () => ({
  TCGCSV_CATEGORY: { en: 3, ja: 85 },
  shelfPrintings: (...a: unknown[]) => shelfPrintings(...a),
}));
vi.mock("@/lib/core/catalogue/rates", () => ({
  fetchUsdToEur: () => fetchUsdToEur(),
}));
vi.mock("@/lib/core/collection/collection", () => ({
  usdToEurForRequest: () => usdToEurForRequest(),
}));
vi.mock("@/lib/storage/postgres", () => ({
  writeTcgplayerPrices: (...a: unknown[]) => writeTcgplayerPrices(...a),
  writeCardPrices: (...a: unknown[]) => writeCardPrices(...a),
  writeUsdEurRate: (...a: unknown[]) => writeUsdEurRate(...a),
  listCatalogueProducts: (...a: unknown[]) => listCatalogueProducts(...a),
}));
/** The Japanese cards the copy matched to a product beyond the committed map; none unless a test says. */
const listCatalogueProducts = vi.fn(async (..._a: unknown[]) => new Map<string, number>());
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
  // tcgcsv's last-updated.txt unreadable: the job dates by the clock, as these tests expect.
  vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  writeTcgplayerPrices.mockResolvedValue(undefined);
  writeCardPrices.mockResolvedValue(undefined);
  usdToEurForRequest.mockResolvedValue(0.8);
  fetchUsdToEur.mockResolvedValue(0.9);
  writeUsdEurRate.mockResolvedValue(undefined);
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
        language: "en",
        tcgId: "base1-4",
        printing: "holofoil",
        date: "2026-09-14",
        price: 900,
        source: "tcgplayer",
      },
      {
        language: "en",
        tcgId: "base1-4",
        printing: "shadowless-holofoil",
        date: "2026-09-14",
        price: 1800,
        source: "tcgplayer",
      },
      {
        language: "en",
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
    fetchUsdToEur.mockRejectedValue(new Error("Dollar rate: 503"));
    usdToEurForRequest.mockResolvedValue(null);

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(writeTcgplayerPrices).toHaveBeenCalled();
    expect(writeCardPrices).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      ok: true,
      rate: { rate: null, stored: false, skipped: "read failed" },
      history: { written: 0, skipped: "no dollar rate" },
    });
  });

  it("stores today's dollar rate and converts the history at it", async () => {
    monday();

    const res = await get("Bearer s3cret");

    expect(writeUsdEurRate).toHaveBeenCalledWith(expect.anything(), "2026-09-14", 0.9);
    expect(usdToEurForRequest).not.toHaveBeenCalled();
    expect(writeCardPrices.mock.calls[0]?.[1][0].price).toBe(900);
    expect(await res.json()).toMatchObject({ ok: true, rate: { rate: 0.9, stored: true } });
  });

  it("a rate that cannot be read falls back to the request's rate and fails nothing", async () => {
    monday();
    fetchUsdToEur.mockRejectedValue(new Error("Dollar rate: 503"));

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(writeUsdEurRate).not.toHaveBeenCalled();
    expect(writeCardPrices.mock.calls[0]?.[1][0].price).toBe(800);
    expect(await res.json()).toMatchObject({
      ok: true,
      rate: { stored: false, skipped: "read failed" },
      history: { written: 3 },
    });
  });

  it("a rate that cannot be written is logged, and the history still uses the day's rate", async () => {
    monday();
    writeUsdEurRate.mockRejectedValue(new Error("Writing the dollar rate failed: boom"));

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(writeCardPrices.mock.calls[0]?.[1][0].price).toBe(900);
    expect(await res.json()).toMatchObject({
      ok: true,
      rate: { rate: 0.9, stored: false, skipped: "write failed" },
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

  describe("the Japanese shelf", () => {
    /** CP1-001, the first card of Double Crisis, linked to TCGplayer's Japanese product 605292. */
    const JAPANESE = [{ productId: 605292, printing: "holofoil", market: 3 }];
    const byCategory = (en: unknown, ja: unknown) =>
      shelfPrintings.mockImplementation(async (category: number) => (category === 85 ? ja : en));

    it("writes its latest figures and a day of history under the Japanese id", async () => {
      monday();
      byCategory(
        { rows: CHARIZARD, groups: 10, answered: 10 },
        { rows: JAPANESE, groups: 20, answered: 20 },
      );

      const body = await (await get("Bearer s3cret")).json();

      expect(shelfPrintings).toHaveBeenCalledWith(85);
      expect(writeTcgplayerPrices).toHaveBeenCalledWith(expect.anything(), [
        { product_id: 605292, printing: "holofoil", market: 3, updated_on: "2026-09-14" },
      ]);
      expect(writeCardPrices.mock.calls[0]![1]).toContainEqual(
        expect.objectContaining({
          language: "ja",
          tcgId: "CP1-001",
          printing: "holofoil",
          date: "2026-09-14",
          price: 2.7,
        }),
      );
      expect(body.japanese).toEqual({ groups: 20, answered: 20, written: 1 });
    });

    // S4a-003 Charizard V: a set TCGdex lists without cards, filled from TCGplayer's Japanese shelf
    // (tcgplayer-japan.ts), so its product is in the copy and not in the committed map.
    it("writes history for a Japanese card the copy matched and the map does not name", async () => {
      monday();
      byCategory(
        { rows: CHARIZARD, groups: 10, answered: 10 },
        { rows: JAPANESE, groups: 20, answered: 20 },
      );
      listCatalogueProducts.mockResolvedValueOnce(new Map([["S4a-003", 605292]]));
      await get("Bearer s3cret");
      expect(listCatalogueProducts).toHaveBeenCalledWith(expect.anything(), "ja");
      expect(writeCardPrices.mock.calls[0]![1]).toContainEqual(
        expect.objectContaining({ tcgId: "S4a-003", printing: "holofoil", price: 2.7 }),
      );
    });

    // neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese; a Japanese product under
    // that id once wrote Chansey into Shining Celebi's line. Each shelf's points carry their catalogue.
    it("writes a Japanese product under an id English also has as the Japanese card's", async () => {
      monday();
      byCategory(
        { rows: CHARIZARD, groups: 10, answered: 10 },
        { rows: JAPANESE, groups: 20, answered: 20 },
      );
      listCatalogueProducts.mockResolvedValueOnce(new Map([["base1-4", 605292]]));
      await get("Bearer s3cret");
      const written = writeCardPrices.mock.calls[0]![1] as {
        language: string;
        tcgId: string;
        price: number;
      }[];
      const onId = written.filter((p) => p.tcgId === "base1-4");
      expect(onId.filter((p) => p.language === "ja").map((p) => p.price)).toEqual([2.7]);
      expect(onId.filter((p) => p.language === "en").map((p) => p.price)).toEqual([
        900, 1800, 9000,
      ]);
    });

    it("dates the night by the day tcgcsv published, not the clock", async () => {
      at("2026-09-14T15:31:00Z");
      vi.stubGlobal("fetch", async () => new Response("2026-09-13T20:05:38+0000"));
      byCategory(
        { rows: CHARIZARD, groups: 10, answered: 10 },
        { rows: JAPANESE, groups: 20, answered: 20 },
      );
      await get("Bearer s3cret");
      expect(writeTcgplayerPrices.mock.calls[0]![1][0]).toMatchObject({ updated_on: "2026-09-13" });
      expect((writeCardPrices.mock.calls[0]![1] as { date: string }[])[0]!.date).toBe("2026-09-13");
    });

    it("leaves the English night standing when the Japanese shelf fails", async () => {
      monday();
      shelfPrintings.mockImplementation(async (category: number) => {
        if (category === 85) throw new Error("tcgcsv 503");
        return { rows: CHARIZARD, groups: 10, answered: 10 };
      });

      const res = await get("Bearer s3cret");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(writeTcgplayerPrices).toHaveBeenCalledTimes(1);
      expect(
        writeCardPrices.mock.calls[0]![1].some((p: { tcgId: string }) => p.tcgId === "base1-4"),
      ).toBe(true);
      expect(body.japanese).toMatchObject({ written: 0, skipped: "read or write failed" });
    });

    it("writes nothing Japanese when most of its groups did not answer", async () => {
      monday();
      byCategory(
        { rows: CHARIZARD, groups: 10, answered: 10 },
        { rows: JAPANESE, groups: 20, answered: 10 },
      );

      const body = await (await get("Bearer s3cret")).json();

      expect(writeTcgplayerPrices).toHaveBeenCalledTimes(1);
      expect(
        writeCardPrices.mock.calls[0]![1].some((p: { tcgId: string }) => p.tcgId === "CP1-001"),
      ).toBe(false);
      expect(body.japanese).toMatchObject({ written: 0, skipped: "too few groups answered" });
    });
  });
});
