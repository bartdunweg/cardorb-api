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
vi.mock("../catalogue/tcgdex-client", async (actual) => ({
  ...(await actual<typeof import("../catalogue/tcgdex-client")>()),
  pricesFor: async () => new Map(),
  usdFor: (ids: string[]) => usdFor(ids),
}));
const groupPrintings = vi.fn();
vi.mock("../catalogue/tcgcsv", () => ({
  groupPrintings: (groupId: number) => groupPrintings(groupId),
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
  groupPrintings.mockReset();
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

  // SVP 027 Pikachu: TCGdex relays no TCGplayer figure for any Scarlet & Violet promo, and
  // TCGplayer prices it at $21.45 in a group of its own, which tcgplayer-links.mjs linked
  // (tcgplayer-ids.generated.json: product 500263 in group 22872). The plain product, not the
  // Pokemon Center stamp beside it at $163.38.
  it("asks tcgcsv for a linked card TCGdex has no TCGplayer figure for", async () => {
    usdFor.mockResolvedValue(new Map());
    groupPrintings.mockResolvedValue(
      new Map([[500263, { holofoil: { marketPrice: 21.45, lowPrice: 17.99, productId: 500263 } }]]),
    );
    const usdForSet = await fresh();
    const answer = await usdForSet("SVP Black Star Promos", ["svp-027"]);
    expect(groupPrintings).toHaveBeenCalledWith(22872);
    expect(answer["svp-027"]?.usd).toEqual({ market: 21.45, low: 17.99, productId: 500263 });
    expect(answer["svp-027"]?.printings?.holofoil?.productId).toBe(500263);
  });

  it("does not ask tcgcsv for a card TCGdex already priced, nor for one nobody linked", async () => {
    usdFor.mockResolvedValue(new Map([["base1-4", { market: 100, low: 80 }]]));
    const usdForSet = await fresh();
    await usdForSet("Base", ["base1-4", "A1-001"]);
    expect(groupPrintings).not.toHaveBeenCalled();
  });

  it("keeps TCGdex's answer when tcgcsv does not answer", async () => {
    usdFor.mockResolvedValue(new Map([["base1-4", { market: 100, low: 80 }]]));
    groupPrintings.mockRejectedValue(new Error("tcgcsv 503"));
    const usdForSet = await fresh();
    expect(await usdForSet("Mixed", ["base1-4", "svp-027"])).toEqual({
      "base1-4": { market: 100, low: 80 },
    });
  });
});
