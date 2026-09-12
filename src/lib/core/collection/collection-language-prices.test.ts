import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where a browse surface's prices come from: TCGplayer, a tcgcsv group at a time, the shelf picked
 * by the catalogue's language.
 *
 * The id maps are one file per shelf, so "the Japanese shelf for a Japanese page" is the whole
 * mechanism, and the one thing that could quietly go wrong: read the English map for a Japanese
 * page and every price is null, with nothing failing.
 */

const groupPrintings = vi.fn();

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: vi.fn(),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: async () => 0.5 }));
vi.mock("../catalogue/tcgcsv", () => ({
  TCGCSV_CATEGORY: { en: 3, ja: 85 },
  groupPrintings: (groupId: number, category: number) => groupPrintings(groupId, category),
}));
vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
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
// Small maps, so which shelf and which group were asked is the assertion.
vi.mock("../tcgplayer-ids.generated.json", () => ({
  default: { "base1-4": { productId: 42382, variants: ["holofoil"] }, "A1-001": null },
}));
vi.mock("../tcgplayer-ids.ja.generated.json", () => ({ default: { "M1S-001": 640001 } }));
vi.mock("../tcgplayer-groups.generated.json", () => ({
  default: { "3": { "42382": 604 }, "85": { "640001": 24001 } },
}));

const { tcgplayerPricesFor } = await import("./collection");

beforeEach(() => {
  groupPrintings.mockReset();
  groupPrintings.mockImplementation(async (groupId: number) =>
    groupId === 604
      ? new Map([[42382, { holofoil: { marketPrice: 800, lowPrice: 450, productId: 42382 } }]])
      : new Map([[640001, { normal: { marketPrice: 4, lowPrice: 2, productId: 640001 } }]]),
  );
});

describe("tcgplayerPricesFor", () => {
  it("prices an English card from its product's group, in euros", async () => {
    const prices = await tcgplayerPricesFor(["base1-4"]);
    expect(groupPrintings).toHaveBeenCalledWith(604, 3);
    expect(prices.get("base1-4")?.price).toEqual({ low: 225, market: 400, avg30: null, nm: null });
  });

  it("reads the Japanese shelf for a Japanese page", async () => {
    const prices = await tcgplayerPricesFor(["M1S-001"], "ja");
    expect(groupPrintings).toHaveBeenCalledWith(24001, 85);
    expect(prices.get("M1S-001")?.price?.market).toBe(2);
  });

  it("prices nothing for a card with no product", async () => {
    expect((await tcgplayerPricesFor(["A1-001"])).size).toBe(0);
    expect(groupPrintings).not.toHaveBeenCalled();
  });
});
