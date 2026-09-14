import { beforeEach, describe, expect, it, vi } from "vitest";

const shelfPrintings = vi.fn();
const writeTcgplayerPrices = vi.fn();
vi.mock("@/lib/core/catalogue/tcgcsv", () => ({
  TCGCSV_CATEGORY: { en: 3, ja: 85 },
  shelfPrintings: (...a: unknown[]) => shelfPrintings(...a),
}));
vi.mock("@/lib/storage/postgres", () => ({
  writeTcgplayerPrices: (...a: unknown[]) => writeTcgplayerPrices(...a),
}));
vi.mock("@/lib/storage/supabase", () => ({ adminClient: () => ({}) }));

const { GET } = await import("./route");

const get = (auth?: string) =>
  GET(
    new Request("https://api.cardorb.com/v1/cron/tcgplayer-prices", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  writeTcgplayerPrices.mockResolvedValue(undefined);
});

describe("GET /api/v1/cron/tcgplayer-prices", () => {
  it("refuses anyone but the cron", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    expect(shelfPrintings).not.toHaveBeenCalled();
  });

  it("writes the English shelf, dated today, and says how much", async () => {
    shelfPrintings.mockResolvedValue({
      rows: [{ productId: 42382, printing: "holofoil", market: 112.5, low: 95 }],
      groups: 10,
      answered: 10,
    });

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(shelfPrintings).toHaveBeenCalledWith(3);
    expect(writeTcgplayerPrices).toHaveBeenCalledWith(expect.anything(), [
      {
        product_id: 42382,
        printing: "holofoil",
        market: 112.5,
        low: 95,
        updated_on: new Date().toISOString().slice(0, 10),
      },
    ]);
    expect(await res.json()).toMatchObject({ ok: true, groups: 10, answered: 10, written: 1 });
  });

  it("writes nothing when most of the shelf did not answer, so yesterday's figures stand", async () => {
    shelfPrintings.mockResolvedValue({ rows: [], groups: 10, answered: 8 });

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(502);
    expect(writeTcgplayerPrices).not.toHaveBeenCalled();
  });
});
