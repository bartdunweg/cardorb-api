import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionRow } from "./collection-row";

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
const listRows = vi.fn();
vi.mock("../../storage/collection", () => ({
  cardsVersion: async () => null,
  listRows: (...a: unknown[]) => listRows(...a),
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

const { assembleFor, japaneseDetailPrice, tcgplayerPricesFor } = await import("./collection");

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

/**
 * A Japanese card someone holds, and one someone opens: TCGplayer's Japanese shelf, never Cardmarket.
 *
 * TCGdex relays Cardmarket's figures on a Japanese card's record and no TCGplayer ones (null on
 * every Japanese card sampled on 2026-09-13). Until then the collection read the first, and every
 * price in Card Orb is TCGplayer's. The record below carries a Cardmarket figure on purpose: it
 * must not reach the card.
 */
const jaRow = (over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: "row-ja",
  name: "ピカチュウ",
  number: "001",
  setName: "Mega Symphonia",
  rarity: null,
  gen: null,
  types: [],
  tcgId: "M1S-001",
  owned: true,
  excluded: false,
  acquiredAt: null,
  finish: "normal",
  foilPattern: null,
  edition: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: "ja",
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  dexFace: false,
  collectionId: null,
  ...over,
});

const tcgdex: Record<string, unknown> = {
  "/ja/cards/M1S-001": {
    id: "M1S-001",
    localId: "001",
    name: "ピカチュウ",
    set: { id: "M1S", name: "メガシンフォニア" },
    pricing: { cardmarket: { low: 90, trend: 99, avg30: 95 }, tcgplayer: null },
  },
  "/ja/cards/M1S-002": {
    id: "M1S-002",
    localId: "002",
    name: "ライチュウ",
    set: { id: "M1S", name: "メガシンフォニア" },
    pricing: { cardmarket: { low: 90, trend: 99, avg30: 95 }, tcgplayer: null },
  },
  "/ja/sets/M1S": { id: "M1S", name: "メガシンフォニア", releaseDate: "2025-08-01" },
};

describe("a Japanese card in a collection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string }) => {
      if (init?.method === "HEAD") return new Response("", { status: 404 });
      const body = tcgdex[url.replace("https://api.tcgdex.net/v2", "")];
      return new Response(body ? JSON.stringify(body) : "", { status: body ? 200 : 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is priced from TCGplayer's Japanese shelf, printing by printing, in euros", async () => {
    listRows.mockResolvedValue([jaRow()]);
    const [set] = await assembleFor("ja-holder", {} as SupabaseClient);
    const card = set!.cards[0]!;
    expect(groupPrintings).toHaveBeenCalledWith(24001, 85);
    // $4 at 0.5 a dollar. Cardmarket's €99 on the record is nowhere.
    expect(card.price).toEqual({ low: 1, market: 2, avg30: null, nm: null });
    expect(card.pricePrintings?.normal?.market).toBe(2);
    expect(card.printingIds).toEqual({ normal: 640001 });
    expect(card.priceHolo).toBeNull();
    expect(JSON.stringify(card)).not.toContain("99");
  });

  it("has no price where TCGplayer has no product for it, rather than Cardmarket's", async () => {
    listRows.mockResolvedValue([jaRow({ id: "row-ja-2", tcgId: "M1S-002", number: "002" })]);
    const [set] = await assembleFor("ja-holder-2", {} as SupabaseClient);
    const card = set!.cards[0]!;
    expect(card.price).toBeNull();
    expect(card.priceHolo).toBeNull();
    expect(card.pricePrintings ?? null).toBeNull();
  });
});

describe("japaneseDetailPrice", () => {
  it("puts the Japanese shelf's price and product on a card's detail", async () => {
    const card = await japaneseDetailPrice({ id: "M1S-001", price: null, tcgplayerId: null }, 0.5);
    expect(groupPrintings).toHaveBeenCalledWith(24001, 85);
    expect(card).toEqual({
      id: "M1S-001",
      price: { low: 1, market: 2, avg30: null, nm: null },
      tcgplayerId: 640001,
    });
  });

  it("prices nothing without a product or without the day's rate", async () => {
    expect(
      await japaneseDetailPrice({ id: "M1S-002", price: null, tcgplayerId: null }, 0.5),
    ).toMatchObject({ price: null, tcgplayerId: null });
    expect(
      await japaneseDetailPrice({ id: "M1S-001", price: null, tcgplayerId: null }, null),
    ).toMatchObject({ price: null, tcgplayerId: null });
  });
});
