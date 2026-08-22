/**
 * The collection screen's decisions, tested without the screen.
 *
 * `src/features/` had no test of any kind, and this file is the first: it
 * covers the arithmetic that used to sit as closures inside a 1,760-line
 * component, where every one of these cases was reachable only by rendering
 * the whole page. Three of them encode a rule the source comments say already
 * shipped wrong once — the "170 of 86" count, the unpriced card that must not
 * fall into "under €5", and unknown sorting last in both directions.
 */

import { describe, expect, it } from "vitest";
import {
  VALUE_BANDS,
  filterSets,
  groupByYear,
  matchesOwnership,
  matchesValue,
  setMeta,
  vintageEras,
  type FilterState,
} from "./cards-filter";
import type { CardSet, OwnedCard, Variant } from "@/lib/core/collection/cards";

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
  key: over.name ?? "c",
  name: "Pikachu",
  number: "001",
  type: "Electric",
  gen: "Base",
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId: null,
  variants: [variant({ owned: over.owned ?? true })],
  owned: true,
  price: null,
  priceHolo: null,
  tcgId: null,
  ...over,
});

/** Only `nm.mid` and `market` are read — see shownPrice in price-basis.mjs. */
const at = (mid: number): OwnedCard["price"] => ({
  low: mid,
  market: mid,
  avg30: mid,
  nm: { low: mid, mid, high: mid },
});

const set = (over: Partial<CardSet> = {}): CardSet => ({
  name: "Base Set",
  title: "Base Set",
  logo: null,
  logoSize: null,
  releaseDate: "1999-01-09",
  total: null,
  cards: [card()],
  ...over,
});

/** Everything off, so each test turns on only what it is about. */
const state = (over: Partial<FilterState> = {}): FilterState => ({
  query: "",
  selected: "all",
  sort: "set",
  pickedEras: new Set(),
  pickedTypes: new Set(),
  pickedRarities: new Set(),
  pickedOwnership: new Set(),
  pickedValues: new Set(),
  vintage: new Set(),
  ...over,
});

describe("setMeta", () => {
  it("counts against the set total while the two can both be true", () => {
    expect(setMeta(set({ total: 102, cards: [card(), card()], releaseDate: null }))).toBe(
      "2 of 102",
    );
  });

  it("drops the total when more is held than the set officially has", () => {
    // The "170 of 86" bug: one collection set name covering several subsets.
    expect(setMeta(set({ total: 1, cards: [card(), card()], releaseDate: null }))).toBe("2 owned");
  });

  it("appends the release month, in the collection's own locale", () => {
    // LOCALE is nl-NL (see lib/core/config.ts) — this is not an English screen.
    expect(setMeta(set({ total: null, cards: [card()], releaseDate: "1999-01-09" }))).toBe(
      "1 owned · januari 1999",
    );
  });

  it("says nothing about a date it cannot read", () => {
    expect(setMeta(set({ total: null, cards: [card()], releaseDate: "not a date" }))).toBe(
      "1 owned",
    );
  });
});

describe("vintageEras", () => {
  it("counts an era vintage by the first year it appears in, not the last", () => {
    const years = new Map<string, [number, number]>([
      ["Base", [1999, 2003]],
      ["Scarlet & Violet", [2023, 2024]],
      // Starts before 2010 and runs past it — the first year decides.
      ["Platinum", [2009, 2011]],
    ]);
    expect(vintageEras(years)).toEqual(new Set(["Base", "Platinum"]));
  });
});

describe("matchesValue", () => {
  it("lets everything through while no band is ticked", () => {
    expect(matchesValue(card({ price: null }), new Set())).toBe(true);
  });

  it("keeps a card with no price out of every band", () => {
    // Unknown is not zero. Putting it in "Under €5" would invent a fact.
    for (const band of VALUE_BANDS) {
      expect(matchesValue(card({ price: null }), new Set([band.value]))).toBe(false);
    }
  });

  it("places a price in exactly one band", () => {
    const inBands = (n: number) =>
      VALUE_BANDS.filter((b) => matchesValue(card({ price: at(n) }), new Set([b.value]))).map(
        (b) => b.value,
      );
    expect(inBands(4.99)).toEqual(["Under €5"]);
    expect(inBands(5)).toEqual(["€5 – €25"]);
    expect(inBands(25)).toEqual(["€25 – €100"]);
    expect(inBands(100)).toEqual(["€100 and up"]);
  });
});

describe("matchesOwnership", () => {
  it("lets everything through while neither tick is on", () => {
    expect(matchesOwnership(card({ owned: false }), new Set())).toBe(true);
  });

  it("is an or, not an and, when both ticks are on", () => {
    const both = new Set(["In the binder", "On the wishlist"]);
    expect(matchesOwnership(card({ owned: true }), both)).toBe(true);
    expect(matchesOwnership(card({ owned: false }), both)).toBe(true);
  });

  it("separates held from wanted when one tick is on", () => {
    expect(matchesOwnership(card({ owned: false }), new Set(["In the binder"]))).toBe(false);
    expect(matchesOwnership(card({ owned: true }), new Set(["On the wishlist"]))).toBe(false);
  });
});

describe("filterSets", () => {
  const base = set({
    name: "Base Set",
    releaseDate: "1999-01-09",
    cards: [card({ key: "a", name: "Charizard", gen: "Base" })],
  });
  const sv = set({
    name: "Surging Sparks",
    releaseDate: "2024-11-08",
    cards: [card({ key: "b", name: "Pikachu", gen: "Scarlet & Violet" })],
  });

  it("keeps only the named set", () => {
    const out = filterSets([base, sv], state({ selected: "Surging Sparks" }));
    expect(out.map((s) => s.name)).toEqual(["Surging Sparks"]);
  });

  it("keeps a set that holds any card of the chosen era, then narrows the cards", () => {
    const mixed = set({
      name: "Mixed",
      cards: [card({ key: "x", gen: "Base" }), card({ key: "y", gen: "Scarlet & Violet" })],
    });
    const out = filterSets([mixed, sv], state({ selected: "era:Base" }));
    expect(out.map((s) => s.name)).toEqual(["Mixed"]);
    expect(out[0]?.cards.map((c) => c.key)).toEqual(["x"]);
  });

  it("keeps every card of a set whose name matches the search", () => {
    // Typing "surging" asks for the set, not for cards with that word in them.
    const out = filterSets([base, sv], state({ query: "surging" }));
    expect(out.map((s) => s.name)).toEqual(["Surging Sparks"]);
    expect(out[0]?.cards).toHaveLength(1);
  });

  it("finds a card through its accents", () => {
    const pokemon = set({ name: "Set", cards: [card({ key: "p", name: "Flabébé" })] });
    expect(filterSets([pokemon], state({ query: "flabebe" }))).toHaveLength(1);
  });

  it("still applies the tick boxes on top of a set-name match", () => {
    const out = filterSets([sv], state({ query: "surging", pickedTypes: new Set(["Fire"]) }));
    expect(out).toEqual([]);
  });

  it("drops a set once every card in it is filtered away", () => {
    const out = filterSets([base, sv], state({ query: "nothing matches this" }));
    expect(out).toEqual([]);
  });

  it("sorts by value inside the set and puts an unknown price last both ways", () => {
    const priced = set({
      name: "Priced",
      cards: [
        card({ key: "cheap", price: at(1) }),
        card({ key: "unknown", price: null }),
        card({ key: "dear", price: at(100) }),
      ],
    });
    expect(filterSets([priced], state({ sort: "value" }))[0]?.cards.map((c) => c.key)).toEqual([
      "dear",
      "cheap",
      "unknown",
    ]);
    expect(filterSets([priced], state({ sort: "value-asc" }))[0]?.cards.map((c) => c.key)).toEqual([
      "cheap",
      "dear",
      "unknown",
    ]);
  });

  it("leaves the order alone when sorting by set", () => {
    const priced = set({
      name: "Priced",
      cards: [card({ key: "cheap", price: at(1) }), card({ key: "dear", price: at(100) })],
    });
    expect(filterSets([priced], state({ sort: "set" }))[0]?.cards.map((c) => c.key)).toEqual([
      "cheap",
      "dear",
    ]);
  });

  it("splits vintage from modern on the era map it is given", () => {
    const vintage = new Set(["Base"]);
    const out = filterSets([base, sv], state({ vintage, pickedEras: new Set(["Vintage"]) }));
    expect(out.map((s) => s.name)).toEqual(["Base Set"]);
    const modern = filterSets([base, sv], state({ vintage, pickedEras: new Set(["Modern"]) }));
    expect(modern.map((s) => s.name)).toEqual(["Surging Sparks"]);
  });

  it("matches a rarity on any printing of the card", () => {
    const rare = set({
      name: "Rare",
      cards: [
        card({
          key: "two-printings",
          variants: [variant({ rarity: "Common" }), variant({ id: "row-2", rarity: "Rare Holo" })],
        }),
      ],
    });
    expect(filterSets([rare], state({ pickedRarities: new Set(["Rare Holo"]) }))).toHaveLength(1);
    expect(filterSets([rare], state({ pickedRarities: new Set(["Illustration Rare"]) }))).toEqual(
      [],
    );
  });

  it("does not mutate the sets it was given", () => {
    const priced = set({
      name: "Priced",
      cards: [card({ key: "cheap", price: at(1) }), card({ key: "dear", price: at(100) })],
    });
    filterSets([priced], state({ sort: "value" }));
    expect(priced.cards.map((c) => c.key)).toEqual(["cheap", "dear"]);
  });
});

describe("groupByYear", () => {
  it("buckets sets by release year, newest first", () => {
    const out = groupByYear([
      set({ name: "Base Set", releaseDate: "1999-01-09", cards: [card({ key: "a" })] }),
      set({ name: "Surging Sparks", releaseDate: "2024-11-08", cards: [card({ key: "b" })] }),
      set({ name: "Prismatic", releaseDate: "2024-01-01", cards: [card({ key: "c" })] }),
    ]);
    expect(out.map((s) => s.name)).toEqual(["2024", "1999"]);
    expect(out[0]?.cards.map((c) => c.key)).toEqual(["b", "c"]);
  });

  it("files a set the catalogue has no date for under Undated", () => {
    const out = groupByYear([set({ name: "Homemade", releaseDate: null })]);
    expect(out.map((s) => s.name)).toEqual(["Undated"]);
  });

  it("does not push cards into the set it was given", () => {
    const one = set({ name: "A", releaseDate: "2024-01-01", cards: [card({ key: "a" })] });
    const two = set({ name: "B", releaseDate: "2024-02-01", cards: [card({ key: "b" })] });
    groupByYear([one, two]);
    expect(one.cards).toHaveLength(1);
  });
});
