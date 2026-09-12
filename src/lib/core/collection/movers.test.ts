import { describe, expect, it } from "vitest";
import { moversOf, type CardPricePoint } from "./movers";
import type { CardSet, OwnedCard, Variant } from "./cards";

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
  key: over.tcgId ?? "k",
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
  price: null,
  priceHolo: null,
  tcgId: "a",
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

const at = (
  tcgId: string,
  date: string,
  market: number | null,
  holo: number | null = null,
): CardPricePoint => ({
  tcgId,
  date,
  market,
  holo,
});

describe("moversOf", () => {
  it("compares each card's earliest reading with its latest", () => {
    const { up } = moversOf(
      [set([card({ tcgId: "a" })])],
      [at("a", "2026-07-01", 10), at("a", "2026-07-08", 12), at("a", "2026-08-01", 15)],
    );
    expect(up[0]).toMatchObject({
      was: 10,
      now: 15,
      change: 5,
      from: "2026-07-01",
      to: "2026-08-01",
    });
    expect(up[0]!.pct).toBeCloseTo(0.5);
  });

  it("sorts them by what they did to the collection, not by percentage", () => {
    // A common that doubles from four cents is a bigger percentage and a
    // smaller event than a chase card that gains eight euros.
    const { up } = moversOf(
      [
        set([
          card({ key: "bulk", tcgId: "bulk", name: "Bulk" }),
          card({ key: "chase", tcgId: "chase", name: "Chase" }),
        ]),
      ],
      [
        at("bulk", "2026-07-01", 0.2),
        at("bulk", "2026-08-01", 0.5),
        at("chase", "2026-07-01", 40),
        at("chase", "2026-08-01", 48),
      ],
    );
    expect(up.map((m) => m.card.name)).toEqual(["Chase", "Bulk"]);
  });

  it("multiplies the change by the copies held", () => {
    const { up } = moversOf(
      [set([card({ tcgId: "a", variants: [variant({ quantity: 3 })] })])],
      [at("a", "2026-07-01", 10), at("a", "2026-08-01", 12)],
    );
    expect(up[0]).toMatchObject({ change: 2, total: 6 });
  });

  it("prices a reverse holo from the foil reading", () => {
    const { up } = moversOf(
      [set([card({ tcgId: "a", variants: [variant({ finish: "reverse-holo" })] })])],
      [at("a", "2026-07-01", 5, 10), at("a", "2026-08-01", 6, 20)],
    );
    expect(up[0]).toMatchObject({ was: 10, now: 20 });
  });

  it("is not a mover on one reading", () => {
    // A card with a single point has not held steady — it has been seen once,
    // and reporting it as unchanged would be inventing a comparison.
    const r = moversOf([set([card({ tcgId: "a" })])], [at("a", "2026-08-01", 10)]);
    expect(r.up).toEqual([]);
    expect(r.down).toEqual([]);
  });

  it("ignores cards that are only wanted", () => {
    const r = moversOf(
      [set([card({ tcgId: "a", variants: [variant({ owned: false })] })])],
      [at("a", "2026-07-01", 10), at("a", "2026-08-01", 40)],
    );
    expect(r.up).toEqual([]);
  });

  it("drops movement too small to be a movement", () => {
    // Cardmarket's figures wobble by a cent or two on thin markets.
    const r = moversOf(
      [set([card({ tcgId: "a" })])],
      [at("a", "2026-07-01", 10), at("a", "2026-08-01", 10.04)],
    );
    expect(r.up).toEqual([]);
  });

  it("separates fallers, steepest first", () => {
    const { down, up } = moversOf(
      [set([card({ key: "x", tcgId: "x", name: "X" }), card({ key: "y", tcgId: "y", name: "Y" })])],
      [
        at("x", "2026-07-01", 20),
        at("x", "2026-08-01", 12),
        at("y", "2026-07-01", 20),
        at("y", "2026-08-01", 18),
      ],
    );
    expect(up).toEqual([]);
    expect(down.map((m) => m.card.name)).toEqual(["X", "Y"]);
    expect(down[0]!.change).toBe(-8);
  });

  it("survives a card with no reading at all", () => {
    expect(moversOf([set([card({ tcgId: "a" })])], []).up).toEqual([]);
  });
});
