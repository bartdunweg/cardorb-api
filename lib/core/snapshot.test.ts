import { describe, expect, it } from "vitest";
import { snapshotOf, type PriceGuide, type ProductIds } from "./snapshot";
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
  quantity: 1,
  condition: null,
  grade: null,
  purchasePrice: null,
  purchaseDate: null,
  notes: null,
  isFavorite: false,
  acquiredAt: null,
  excluded: false,
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
  name: "Obsidian Flames",
  title: "Obsidian Flames",
  logo: null,
  logoSize: null,
  releaseDate: null,
  total: null,
  cards,
});

const guide = (rows: PriceGuide["priceGuides"] = []): PriceGuide => ({
  createdAt: "2026-08-16T02:48:45+0200",
  priceGuides: rows,
});

/** trend 10 with avg30 10 lands on a market of 10 and an nm mid above it. */
const PRODUCT = { idProduct: 42, low: 1, trend: 10, avg30: 10 };
const IDS: ProductIds = { "sv03-125": 42 };

const valueOf = (sets: CardSet[], g = guide([PRODUCT]), ids = IDS) => snapshotOf(sets, g, ids);

describe("snapshotOf", () => {
  it("dates the point by the guide, not by the clock", () => {
    // The reading is "what Cardmarket published that morning". Stamping it with
    // now() would file an archived guide under today and put a 2024 valuation
    // at the right-hand end of the chart.
    expect(valueOf([set([card()])]).date).toBe("2026-08-16");
  });

  it("values every copy held", () => {
    const one = valueOf([set([card()])]);
    const three = valueOf([
      set([card({ variants: [variant({ id: "a", quantity: 2 }), variant({ id: "b" })] })])],
    );
    expect(three.value).toBeCloseTo(one.value * 3);
    expect(three.cards).toBe(3);
    // Coverage counts distinct cards, however many copies there are.
    expect(three.priced).toBe(1);
  });

  it("leaves the wishlist out", () => {
    const wanted = valueOf([set([card({ variants: [variant({ owned: false })] })])]);
    expect(wanted).toMatchObject({ value: 0, cards: 0, priced: 0, unpriced: 0 });
  });

  it("counts a held card the guide has no price for as unpriced, not as free", () => {
    const s = valueOf([set([card()])], guide([]));
    expect(s).toMatchObject({ value: 0, cards: 1, priced: 0, unpriced: 1 });
  });

  it("counts a card with no Cardmarket product as unpriced", () => {
    // A card added since cardmarket-ids.generated.json was last written. It is
    // held, so it counts as a copy; it just cannot be valued yet.
    const s = valueOf([set([card({ tcgId: "sv09-001" })])]);
    expect(s).toMatchObject({ cards: 1, priced: 0, unpriced: 1 });
  });

  it("ignores the card's own price entirely", () => {
    // The guide is the source. A price left on the card — which should not
    // happen with { prices: false }, but might if a caller forgets — must not
    // quietly become the answer.
    const s = valueOf([set([card({ price: { low: 999, market: 999, avg30: 999, nm: null } })])], guide([]));
    expect(s.value).toBe(0);
    expect(s.unpriced).toBe(1);
  });

  it("survives an empty collection", () => {
    expect(valueOf([])).toMatchObject({ value: 0, cards: 0, priced: 0, unpriced: 0 });
  });
});
