import { describe, expect, it, vi } from "vitest";

/**
 * Which id map guidePricesFor() reads is decided by the language it is given.
 *
 * The maps are one file per catalogue because the ids collide between them — SM1S-001 is a
 * Japanese card and a different Korean one — so "the Japanese map for a Japanese page" is the
 * whole mechanism, and the one thing that could quietly go wrong: read the English map for a
 * Japanese page and every price is null again, with nothing failing.
 */

const guidePrices = vi.fn((..._a: unknown[]) => new Map());

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("../catalogue/catalogue", () => ({
  setCatalogue: vi.fn(),
  pricesFor: async () => new Map(),
  json: async () => null,
}));
vi.mock("../catalogue/rates", () => ({ fetchUsdToEur: async () => null }));
vi.mock("../catalogue/ptcg", () => ({
  ptcgScan: async () => null,
  ptcgLogo: async () => null,
  ptcgPrices: async () => new Map(),
}));
vi.mock("../catalogue/price-guide", () => ({
  fetchPriceGuide: async () => ({ priceGuides: [], createdAt: "today" }),
  guidePrices: (...a: unknown[]) => guidePrices(...(a as [])),
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
// The committed maps, small enough to read whole: which one arrives is the assertion.
vi.mock("../cardmarket-ids.generated.json", () => ({ default: { "base1-4": 273699 } }));
vi.mock("../cardmarket-ids.ja.generated.json", () => ({ default: { "M1S-001": 840539 } }));
vi.mock("../cardmarket-ids.ko.generated.json", () => ({ default: { "SM1S-001": 1 } }));
vi.mock("../cardmarket-ids.zh-tw.generated.json", () => ({ default: {} }));
vi.mock("../cardmarket-ids.zh-cn.generated.json", () => ({ default: {} }));

const { guidePricesFor } = await import("./collection");

/** The id map the guide was asked to price, on the last call. */
const mapRead = () => guidePrices.mock.lastCall?.[2] as Record<string, number> | undefined;

describe("guidePricesFor", () => {
  it("reads the English map when no catalogue is named", async () => {
    await guidePricesFor(["base1-4"]);
    expect(mapRead()).toEqual({ "base1-4": 273699 });
  });

  it("reads the named catalogue's own map", async () => {
    await guidePricesFor(["M1S-001"], "ja");
    expect(mapRead()).toEqual({ "M1S-001": 840539 });
  });

  it("keeps the catalogues apart where their ids collide", async () => {
    await guidePricesFor(["SM1S-001"], "ko");
    expect(mapRead()).toEqual({ "SM1S-001": 1 });
    expect(mapRead()).not.toHaveProperty("M1S-001");
  });
});
