import { describe, expect, it } from "vitest";
import { cardPricesFromSets, cardPricesFromTcgcsv, snapshotFromSets } from "./snapshot";
import type { CardSet, OwnedCard, Variant } from "./cards";

/**
 * The arithmetic behind a point on the chart.
 *
 * Worth testing on its own because two things have to agree on it — this and
 * scripts/snapshot-collection-value.mjs — and because it is written down
 * permanently. A page that renders a wrong total is wrong until it is fixed; a
 * snapshot that records one is wrong for as long as the chart exists.
 */

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: "row-1",
  rarity: null,
  owned: true,
  finish: null,
  foilPattern: null,
  edition: null,
  quantity: 1,
  condition: null,
  grade: null,
  language: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  dexFace: false,
  acquiredAt: null,
  excluded: false,
  collectionId: null,
  ...over,
});

const card = (over: Partial<OwnedCard> = {}): OwnedCard => ({
  key: "k",
  name: "Pikachu",
  number: "001",
  type: null,
  gen: null,
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId: null,
  variants: [variant()],
  owned: true,
  // Deliberately null everywhere below: this runs on the output of
  // buildCollection(rows, { prices: false }), so the card's own price is never
  // the source. If a test passes because a price leaked in here, it is testing
  // the wrong path.
  price: null,
  priceHolo: null,
  tcgId: "sv03-125",
  ...over,
});

const set = (cards: OwnedCard[]): CardSet => ({
  language: null,
  name: "Obsidian Flames",
  title: "Obsidian Flames",
  abbreviation: null,
  logo: null,
  logoSize: null,
  releaseDate: null,
  total: null,
  cards,
});

describe("snapshotFromSets and cardPricesFromSets", () => {
  const priced = (market: number, holo: number | null = null, over: Partial<OwnedCard> = {}) =>
    card({
      price: { market, low: null, nm: null } as unknown as OwnedCard["price"],
      // The foil figure is TCGplayer's reverse-holofoil printing, as it is on a live card.
      pricePrintings:
        holo == null
          ? null
          : ({
              normal: { market, low: null, nm: null },
              "reverse-holofoil": { market: holo, low: null, nm: null },
            } as unknown as OwnedCard["pricePrintings"]),
      ...over,
    });

  it("values every held copy at the card's own price, the foil for a reverse holo", () => {
    const sets = [
      set([
        priced(10, 30, {
          variants: [variant({ quantity: 2 }), variant({ id: "row-2", finish: "reverse-holo" })],
        }),
        priced(5, null, { tcgId: "sv03-126", key: "k2" }),
      ]),
    ];
    expect(snapshotFromSets(sets, "2026-09-07")).toEqual({
      date: "2026-09-07",
      value: 55,
      cards: 4,
      priced: 2,
      unpriced: 0,
      added: 0,
      addedValue: 0,
    });
  });

  it("counts the copies added since the point before, at tonight's price", () => {
    const sets = [
      set([
        priced(10, null, {
          variants: [
            variant({ quantity: 2, acquiredAt: "2026-09-06T12:00:00Z" }),
            variant({ id: "row-2", acquiredAt: "2026-08-01T00:00:00Z" }),
          ],
        }),
      ]),
    ];
    const point = snapshotFromSets(sets, "2026-09-07", "2026-09-05");
    expect([point.cards, point.added, point.addedValue]).toEqual([3, 2, 20]);
  });

  it("counts a held card with no price as unpriced and leaves wishes out", () => {
    const sets = [
      set([
        card({ variants: [variant()] }),
        priced(9, null, {
          tcgId: "w",
          key: "w",
          owned: false,
          variants: [variant({ owned: false })],
        }),
      ]),
    ];
    expect(snapshotFromSets(sets, "2026-09-07")).toEqual({
      date: "2026-09-07",
      value: 0,
      cards: 1,
      priced: 0,
      unpriced: 1,
      added: 0,
      addedValue: 0,
    });
  });

  it("lists every printing of every held card with a price", () => {
    const sets = [
      set([
        priced(10, 30),
        card({ tcgId: "none", key: "n" }),
        priced(9, null, {
          tcgId: "w",
          key: "w",
          owned: false,
          variants: [variant({ owned: false })],
        }),
      ]),
    ];
    expect(cardPricesFromSets(sets, "2026-09-07")).toEqual([
      { tcgId: "sv03-125", printing: "normal", date: "2026-09-07", price: 10, source: "tcgplayer" },
      {
        tcgId: "sv03-125",
        printing: "reverse-holofoil",
        date: "2026-09-07",
        price: 30,
        source: "tcgplayer",
      },
    ]);
  });

  // Since 2026-09-13 each printing is its own series: a 1st Edition copy's history is the stamped
  // run's, not the unlimited one's.
  it("records the market the card shows: every printing TCGplayer prices, else the card's own figure", () => {
    const eur = (market: number) => ({ market, low: null, avg30: null, nm: null });
    const sets = [
      set([
        // A Jungle Scyther: two printings on TCGplayer, and the printings win over the card's figure.
        priced(20.72, 19.69, {
          tcgId: "base2-10",
          pricePrintings: { "unlimited-holofoil": eur(53.23), unlimited: eur(15.19) },
        }),
        // A card with no printings of its own: the plain series is the card's figure, TCGplayer's
        // since 2026-09-12, and there is no foil series to invent.
        priced(7, null, { tcgId: "svp-1", key: "k-promo" }),
      ]),
    ];
    expect(cardPricesFromSets(sets, "2026-09-12")).toEqual([
      {
        tcgId: "base2-10",
        printing: "unlimited-holofoil",
        date: "2026-09-12",
        price: 53.23,
        source: "tcgplayer",
      },
      {
        tcgId: "base2-10",
        printing: "unlimited",
        date: "2026-09-12",
        price: 15.19,
        source: "tcgplayer",
      },
      { tcgId: "svp-1", printing: "market", date: "2026-09-12", price: 7, source: "tcgplayer" },
    ]);
  });
});

describe("cardPricesFromTcgcsv", () => {
  const shelf = new Map([
    [
      502552,
      new Map([
        ["Normal", 0.25],
        ["Reverse Holofoil", 1.5],
      ]),
    ],
    [42382, new Map([["Holofoil", 869.02]])],
  ]);

  it("prices every printing of every mapped card TCGplayer has a figure for, in euros", () => {
    const points = cardPricesFromTcgcsv(
      { "sv03.5-001": 502552, "base1-4": 42382, "no-product": null, "not-on-shelf": 1 },
      shelf,
      0.9,
      "2026-09-14",
    );
    expect(points).toEqual([
      {
        tcgId: "sv03.5-001",
        printing: "normal",
        date: "2026-09-14",
        price: 0.23,
        source: "tcgplayer",
      },
      {
        tcgId: "sv03.5-001",
        printing: "reverse-holofoil",
        date: "2026-09-14",
        price: 1.35,
        source: "tcgplayer",
      },
      {
        tcgId: "base1-4",
        printing: "holofoil",
        date: "2026-09-14",
        price: 782.12,
        source: "tcgplayer",
      },
    ]);
  });
});
