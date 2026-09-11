import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsdPrice } from "../catalogue/tcgdex-client";

/**
 * The second market, from TCGdex, a set at a time.
 *
 * pokemontcg.io was asked per set for TCGplayer's prices until 2026-09-11, behind a quiet
 * period and a per-instance last-good answer; this file guarded those. It answered one set
 * in eight by then. TCGdex relays the same number on each card's record, and what is left
 * to guard is smaller: a set is asked for by its cards, a card TCGdex would not answer for
 * costs that card and not the set, and a read that answered for nothing is not kept.
 */

const usdFor = vi.fn<(ids: string[]) => Promise<Map<string, UsdPrice>>>();

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: vi.fn(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: async () => 0.9 }));
vi.mock("../catalogue/tcgdex-client", () => ({
  pricesFor: async () => new Map(),
  usdFor: (ids: string[]) => usdFor(ids),
}));
vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
}));
vi.mock("../catalogue/price-guide", () => ({
  guidePrices: async () => ({}),
}));
vi.mock("../../storage/supabase", () => ({
  createServiceClient: () => null,
  createClient: async () => null,
}));
vi.mock("../../storage/postgres", () => ({ listCardPrices: vi.fn() }));
vi.mock("../../storage/collection", () => ({
  listRows: vi.fn(),
  listSnapshots: vi.fn(),
  publicProfile: vi.fn(),
}));

const fresh = async () => {
  vi.resetModules();
  return (await import("./collection")).usdForSet;
};

beforeEach(() => {
  usdFor.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("usdForSet", () => {
  it("asks TCGdex for the set's cards and keys the answer by card id", async () => {
    usdFor.mockResolvedValue(new Map([["base1-4", { market: 100, low: 80 }]]));
    const usdForSet = await fresh();
    expect(await usdForSet("Base", ["base1-4", "base1-2"])).toEqual({
      "base1-4": { market: 100, low: 80 },
    });
    expect(usdFor).toHaveBeenCalledWith(["base1-4", "base1-2"]);
  });

  it("asks for nothing when there is nothing to ask for", async () => {
    const usdForSet = await fresh();
    expect(await usdForSet("Base", [])).toEqual({});
    expect(usdFor).not.toHaveBeenCalled();
  });

  it("reads Cardmarket alone for this request when TCGdex answered for nothing, rather than throwing", async () => {
    usdFor.mockRejectedValue(new Error("TCGdex answered for none of the cards"));
    const usdForSet = await fresh();
    expect(await usdForSet("Base", ["base1-4"])).toEqual({});
  });
});
