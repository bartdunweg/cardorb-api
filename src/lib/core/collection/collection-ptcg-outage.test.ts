import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsdPrice } from "../catalogue/ptcg";

/**
 * What one failing set costs the sets after it.
 *
 * The quiet period was one deadline for the whole instance, tripped by one failure. The
 * 04:00 snapshot cron always runs on a cold instance, where the last-good answers are
 * empty, so a single pokemontcg.io hiccup on the first set left every later set of that
 * run with no second market — and shownPrice() then reads Cardmarket's Near Mint band,
 * which above €20 is market × 1.275 against a blend of 1.1375: about 12% high, written
 * into permanent history behind one console.error.
 *
 * The latency the global deadline was for is real, so it is still here: it now takes
 * several sets failing in a row, which is what an outage actually looks like when
 * buildCollection() resolves six sets at a time.
 */

const ptcgPrices = vi.fn<(setName: string) => Promise<Map<string, UsdPrice> | null>>();

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: async () => null,
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: async () => 0.9 }));
vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
  ptcgPrices: (setName: string) => ptcgPrices(setName),
}));
vi.mock("../catalogue/price-guide", () => ({
  fetchPriceGuide: async () => null,
  guidePrices: () => [],
}));
vi.mock("../../storage/supabase", () => ({
  adminClient: () => ({}),
  serverClient: async () => ({}),
  userClient: () => ({}),
}));
vi.mock("../../storage/postgres", () => ({ listCardPrices: vi.fn() }));
vi.mock("../../storage/collection", () => ({
  listRows: vi.fn(),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
}));

const PRICES = new Map<string, UsdPrice>([["004", { market: 100, low: 80 }]]);

/**
 * A fresh module each time, because the quiet period and the last-good answers are
 * module state on purpose — per instance, so a warm function remembers. A test that
 * shared them would be testing whichever test ran first.
 */
const fresh = async () => {
  vi.resetModules();
  return (await import("./collection")).usdForSet;
};

beforeEach(() => {
  ptcgPrices.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("usdForSet", () => {
  it("does not take the next set's second market down with the one that failed", async () => {
    ptcgPrices.mockImplementation(async (set) => (set === "Bad" ? null : PRICES));
    const usdForSet = await fresh();

    expect(await usdForSet("Bad")).toEqual({});
    // The bug: this used to come back {} as well, for every remaining set of the run.
    expect(await usdForSet("Good")).toEqual({ "004": { market: 100, low: 80 } });
    expect(ptcgPrices).toHaveBeenCalledWith("Good");
  });

  it("does not ask the same failed set again inside the quiet period", async () => {
    ptcgPrices.mockResolvedValue(null);
    const usdForSet = await fresh();

    await usdForSet("Bad");
    await usdForSet("Bad");
    expect(ptcgPrices).toHaveBeenCalledTimes(1);
  });

  it("stops asking at all once several sets in a row have failed", async () => {
    ptcgPrices.mockImplementation(async (set) => (set === "Good" ? PRICES : null));
    const usdForSet = await fresh();

    for (const set of ["A", "B", "C"]) expect(await usdForSet(set)).toEqual({});
    // Three different sets with nothing answering between them is pokemontcg.io being
    // down, and the fourth set is not made to wait out its own timeout to find out.
    expect(await usdForSet("Good")).toEqual({});
    expect(ptcgPrices).not.toHaveBeenCalledWith("Good");
  });

  it("counts only failures with no answer between them", async () => {
    ptcgPrices.mockImplementation(async (set) => (set.startsWith("Ok") ? PRICES : null));
    const usdForSet = await fresh();

    await usdForSet("A");
    await usdForSet("Ok1");
    await usdForSet("B");
    await usdForSet("C");
    // Two failures since the last answer, not three: a set that is simply odd never
    // silences the market for the rest of the run.
    expect(await usdForSet("Ok2")).toEqual({ "004": { market: 100, low: 80 } });
  });
});
