import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dollar rate out of usd_eur_rates, which the nightly price cron writes. frankfurter is asked
 * only when nothing is stored or the table cannot be read, so a request never waits on an outside
 * host once the cron has run.
 */

const fetchUsdToEur = vi.fn();
const readLatestUsdEurRate = vi.fn();
let db: object | null = {};

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("../catalogue/ptcg", () => ({ ptcgScan: async () => null, ptcgLogo: async () => null }));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: () => fetchUsdToEur() }));
vi.mock("../../storage/supabase", () => ({
  adminClient: () => db,
  serverClient: async () => ({}),
  userClient: () => ({}),
}));
vi.mock("../../storage/postgres", () => ({
  listCardPrices: vi.fn(),
  readTcgplayerPrices: vi.fn(),
  readLatestUsdEurRate: (...a: unknown[]) => readLatestUsdEurRate(...a),
}));

const { storedUsdToEur } = await import("./collection");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = {};
  fetchUsdToEur.mockResolvedValue(0.5);
});

describe("storedUsdToEur", () => {
  it("uses the latest stored rate and asks no outside host", async () => {
    readLatestUsdEurRate.mockResolvedValue({ day: "2026-09-14", rate: 0.853 });

    expect(await storedUsdToEur()).toBe(0.853);
    expect(readLatestUsdEurRate).toHaveBeenCalledWith(db);
    expect(fetchUsdToEur).not.toHaveBeenCalled();
  });

  it("asks frankfurter while nothing is stored", async () => {
    readLatestUsdEurRate.mockResolvedValue(null);

    expect(await storedUsdToEur()).toBe(0.5);
    expect(fetchUsdToEur).toHaveBeenCalledTimes(1);
  });

  it("asks frankfurter when the table cannot be read", async () => {
    readLatestUsdEurRate.mockRejectedValue(new Error("Reading the dollar rate failed: boom"));

    expect(await storedUsdToEur()).toBe(0.5);
    expect(fetchUsdToEur).toHaveBeenCalledTimes(1);
  });

  it("asks frankfurter when there is no database client", async () => {
    db = null;

    expect(await storedUsdToEur()).toBe(0.5);
    expect(readLatestUsdEurRate).not.toHaveBeenCalled();
  });
});
