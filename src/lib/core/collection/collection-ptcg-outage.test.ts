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
  TCGCSV_CATEGORY: { en: 3, ja: 85 },
  groupPrintings: (groupId: number, category: number) => groupPrintings(groupId, category),
}));
vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
}));
vi.mock("../../storage/supabase", () => ({
  createServiceClient: () => null,
  createClient: async () => null,
  adminClient: () => null,
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
const freshRuns = async () => {
  vi.resetModules();
  return (await import("./collection")).runPrintingsForSet;
};

beforeEach(() => {
  usdFor.mockReset();
  groupPrintings.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("usdForSet", () => {
  // Base Set Charizard, product 42382 (tcgplayer-ids.generated.json), read out of the one store
  // every price reads; the store is TCGplayer's own files here, as it is before the price job ran.
  const charizard = new Map([[42382, { holofoil: { marketPrice: 400, productId: 42382 } }]]);

  it("prices a linked card out of the store and asks TCGdex nothing", async () => {
    groupPrintings.mockResolvedValue(charizard);
    const usdForSet = await fresh();
    const answer = await usdForSet("Base", ["base1-4"]);
    expect(answer["base1-4"]?.usd).toEqual({ market: 400, productId: 42382 });
    expect(usdFor).not.toHaveBeenCalled();
  });

  it("asks for nothing when there is nothing to ask for", async () => {
    const usdForSet = await fresh();
    expect(await usdForSet("Base", [])).toEqual({});
    expect(usdFor).not.toHaveBeenCalled();
    expect(groupPrintings).not.toHaveBeenCalled();
  });

  // SVP 027 Pikachu: TCGdex relays no TCGplayer figure for any Scarlet & Violet promo, and
  // TCGplayer prices it at $21.45 in a group of its own, which tcgplayer-links.mjs linked
  // (tcgplayer-ids.generated.json: product 500263 in group 22872). The plain product, not the
  // Pokemon Center stamp beside it at $163.38.
  it("prices a card linked to a group of its own the same way", async () => {
    groupPrintings.mockResolvedValue(
      new Map([[500263, { holofoil: { marketPrice: 21.45, productId: 500263 } }]]),
    );
    const usdForSet = await fresh();
    const answer = await usdForSet("SVP Black Star Promos", ["svp-027"]);
    expect(groupPrintings).toHaveBeenCalledWith(22872, 3);
    expect(answer["svp-027"]?.usd).toEqual({ market: 21.45, productId: 500263 });
    expect(answer["svp-027"]?.printings?.holofoil?.productId).toBe(500263);
  });

  it("asks TCGdex only for a card the map has not seen, never for one it holds as unlinked", async () => {
    usdFor.mockResolvedValue(new Map([["zz-new-1", { market: 3 }]]));
    const usdForSet = await fresh();
    // A1-001 is a Pocket card: the map holds it as null, TCGplayer sells no such product.
    expect(await usdForSet("Mixed", ["zz-new-1", "A1-001"])).toEqual({
      "zz-new-1": { market: 3 },
    });
    expect(usdFor).toHaveBeenCalledWith(["zz-new-1"]);
  });

  it("keeps the store's answer when TCGdex does not answer for a new card", async () => {
    groupPrintings.mockResolvedValue(charizard);
    usdFor.mockRejectedValue(new Error("TCGdex answered for none of the cards"));
    const usdForSet = await fresh();
    const answer = await usdForSet("Mixed", ["base1-4", "zz-new-1"]);
    expect(Object.keys(answer)).toEqual(["base1-4"]);
  });

  it("leaves a linked card unpriced for this request when its group does not answer", async () => {
    groupPrintings.mockRejectedValue(new Error("tcgcsv 503"));
    const usdForSet = await fresh();
    expect(await usdForSet("Base", ["base1-4"])).toEqual({});
  });
});

describe("runPrintingsForSet", () => {
  // Base Set Charizard in TCGplayer's "Base Set (Shadowless)" group (1663), product 106999, as
  // tcgplayer-links.mjs linked it: "Unlimited Holofoil" there is the Shadowless holo, "1st Edition
  // Holofoil" the stamped one. Figures read off tcgcsv on 2026-09-12.
  it("names the Shadowless group's printings as runs the copy rule can ask for", async () => {
    groupPrintings.mockResolvedValue(
      new Map([
        [
          106999,
          {
            "unlimited-holofoil": { marketPrice: 2257.87, productId: 106999 },
            "1st-edition-holofoil": { marketPrice: 10000, productId: 106999 },
          },
        ],
      ]),
    );
    const runPrintingsForSet = await freshRuns();
    const runs = await runPrintingsForSet(["base1-4", "base2-1"]);
    expect(groupPrintings).toHaveBeenCalledWith(1663, 3);
    expect(runs["base1-4"]?.printings["shadowless-holofoil"]?.market).toBe(2257.87);
    expect(runs["base1-4"]?.printings["1st-edition-holofoil"]?.market).toBe(10000);
    expect(runs["base1-4"]?.firstEd?.market).toBe(10000);
    // Jungle has no Shadowless run, so nothing is asked about it.
    expect(runs["base2-1"]).toBeUndefined();
  });

  it("is nothing when the group does not answer, rather than throwing", async () => {
    groupPrintings.mockRejectedValue(new Error("tcgcsv 503"));
    const runPrintingsForSet = await freshRuns();
    expect(await runPrintingsForSet(["base1-4"])).toEqual({});
  });
});
