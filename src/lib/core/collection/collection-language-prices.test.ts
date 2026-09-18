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
vi.mock("../../storage/supabase", () => ({
  adminClient: () => ({}),
  serverClient: async () => ({}),
  userClient: () => ({}),
}));
vi.mock("../../storage/postgres", () => ({
  listCardPrices: vi.fn(),
  catalogueProductIds: async () => new Map(),
  // M1S-001's Master Ball reverse, a product of its own (card_print_pictures).
  printProductsOfCards: async (_db: unknown, _language: string, ids: string[]) =>
    new Map(
      ids.includes("M1S-001") ? [["M1S-001", [{ finish: "master-ball", productId: 640002 }]]] : [],
    ),
}));
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
  default: { "3": { "42382": 604 }, "85": { "640001": 24001, "640002": 24001 } },
}));

const { assembleFor, detailPrice, pricePatternPrints, tcgplayerPricesFor } =
  await import("./collection");
const { copyPriceOf } = await import("../price-basis.mjs");

beforeEach(() => {
  groupPrintings.mockReset();
  groupPrintings.mockImplementation(async (groupId: number) =>
    groupId === 604
      ? new Map([[42382, { holofoil: { marketPrice: 800, productId: 42382 } }]])
      : new Map([
          [640001, { normal: { marketPrice: 4, productId: 640001 } }],
          [640002, { holofoil: { marketPrice: 40, productId: 640002 } }],
        ]),
  );
});

describe("tcgplayerPricesFor", () => {
  it("prices an English card from its product's group, in euros", async () => {
    const prices = await tcgplayerPricesFor(["base1-4"]);
    expect(groupPrintings).toHaveBeenCalledWith(604, 3);
    expect(prices.get("base1-4")?.price).toEqual({ market: 400, basis: "market" });
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

  /* The set page's rule: the figure is the printing the sheet opens on, and says which. */
  it("prices the first printing in the sheet's order where the printings are given", async () => {
    groupPrintings.mockImplementation(
      async () =>
        new Map([
          [
            42382,
            {
              holofoil: { marketPrice: 800, productId: 42382 },
              "reverse-holofoil": { marketPrice: 10, productId: 42382 },
            },
          ],
        ]),
    );
    const sheet = [
      { finish: "reverse-holo" as const, foilPattern: null },
      { finish: "holo" as const, foilPattern: null },
    ];
    const headline = await tcgplayerPricesFor(
      ["base1-4"],
      null,
      Promise.resolve(new Map([["base1-4", sheet]])),
    );
    expect(headline.get("base1-4")).toEqual({
      price: { market: 5, basis: "market" },
      printing: "reverse-holo",
      series: "reverse-holofoil",
    });
    // Without them, the search's and the card list's figure as before.
    expect((await tcgplayerPricesFor(["base1-4"])).get("base1-4")).toEqual({
      price: { market: 400, basis: "market" },
    });
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
    expect(card.price).toEqual({ market: 2, basis: "market" });
    expect(card.pricePrintings?.normal?.market).toBe(2);
    expect(card.printingIds).toEqual({ normal: 640001, "master-ball-reverse-holofoil": 640002 });
    expect(JSON.stringify(card)).not.toContain("99");
  });

  // Bart, 2026-09-15: a Japanese Master Ball copy was priced from the plain product.
  it("prices a Japanese Master Ball copy from its own product, not the plain card's", async () => {
    listRows.mockResolvedValue([jaRow({ id: "row-ja-mb", finish: "master-ball" })]);
    const [set] = await assembleFor("ja-holder-mb", {} as SupabaseClient);
    const card = set!.cards[0]!;
    expect(card.pricePrintings?.["master-ball-reverse-holofoil"]?.market).toBe(20);
    // What the copy is worth reads that printing, not the card's plain headline figure ($4, €2).
    expect(copyPriceOf({ finish: "master-ball", edition: null }, card)).toEqual({
      market: 20,
      basis: "market",
    });
  });

  it("has no price where TCGplayer has no product for it, rather than Cardmarket's", async () => {
    listRows.mockResolvedValue([jaRow({ id: "row-ja-2", tcgId: "M1S-002", number: "002" })]);
    const [set] = await assembleFor("ja-holder-2", {} as SupabaseClient);
    const card = set!.cards[0]!;
    expect(card.price).toBeNull();
    expect(card.pricePrintings ?? null).toBeNull();
  });
});

describe("detailPrice", () => {
  it("puts the Japanese shelf's price and product on a card's detail", async () => {
    const card = await detailPrice({ id: "M1S-001", price: null, tcgplayerId: null }, "ja", 0.5);
    expect(groupPrintings).toHaveBeenCalledWith(24001, 85);
    expect(card).toMatchObject({ id: "M1S-001", price: { market: 2 }, tcgplayerId: 640001 });
    expect(Object.keys(card.pricePrintings ?? {})).not.toHaveLength(0);
  });

  it("replaces the figure TCGdex relays on an English card with the one every list shows", async () => {
    const card = await detailPrice(
      { id: "base1-4", price: { market: 999 }, tcgplayerId: null },
      null,
      0.5,
    );
    expect(groupPrintings).toHaveBeenCalledWith(604, 3);
    expect(card).toMatchObject({ id: "base1-4", price: { market: 400 }, tcgplayerId: 42382 });
    // Every printing beside it, so the sheet can show them apart.
    expect(card.printingIds).toMatchObject({ holofoil: 42382 });
  });

  it("keeps TCGdex's figure for an English card with no TCGplayer product", async () => {
    const card = { id: "nowhere-1", price: { market: 3 }, tcgplayerId: null };
    expect(await detailPrice(card, null, 0.5)).toEqual(card);
  });

  it("prices nothing without a product on the Japanese shelf or without the day's rate", async () => {
    expect(
      await detailPrice({ id: "M1S-002", price: null, tcgplayerId: null }, "ja", 0.5),
    ).toMatchObject({ price: null, tcgplayerId: null });
    expect(
      await detailPrice({ id: "M1S-001", price: null, tcgplayerId: null }, "ja", null),
    ).toMatchObject({ price: null, tcgplayerId: null });
  });
});

describe("pricePatternPrints", () => {
  it("is no answer for a card with no product, and keeps Standard on a card with no pattern", async () => {
    expect(await pricePatternPrints(null, 0.5)).toBeNull();
    expect(await pricePatternPrints({ standard: true, prints: [] }, 0.5)).toEqual({
      standard: true,
      prints: [],
    });
    expect(groupPrintings).not.toHaveBeenCalled();
  });

  /* Iono (sv02-185) is sold as a cosmos holo twice, a Prize Pack product and a Miscellaneous one:
     one pattern, one line, and the one with a price stands for it. */
  it("prices each pattern print once per finish, from the product that has a price", async () => {
    const answer = await pricePatternPrints(
      {
        standard: true,
        prints: [
          { foilPattern: "cosmos", finish: "holo", productId: 42381, printing: "holofoil" },
          { foilPattern: "cosmos", finish: "holo", productId: 42382, printing: "holofoil" },
          {
            foilPattern: "cosmos",
            finish: "reverse-holo",
            productId: 42383,
            printing: "reverse-holofoil",
          },
        ],
      },
      0.5,
    );
    expect(answer).toEqual({
      standard: true,
      prints: [
        {
          foilPattern: "cosmos",
          finish: "holo",
          tcgplayerId: 42382,
          price: { market: 400, basis: "market" },
        },
        { foilPattern: "cosmos", finish: "reverse-holo", tcgplayerId: 42383, price: null },
      ],
    });
  });

  it("names the prints without a price when the day's rate is missing", async () => {
    const answer = await pricePatternPrints(
      {
        standard: false,
        prints: [{ foilPattern: "cosmos", finish: "holo", productId: 42382, printing: "holofoil" }],
      },
      null,
    );
    expect(answer).toEqual({
      standard: false,
      prints: [{ foilPattern: "cosmos", finish: "holo", tcgplayerId: 42382, price: null }],
    });
  });
});
