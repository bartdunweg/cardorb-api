import { describe, expect, it } from "vitest";
import type { CardSet, OwnedCard, Variant } from "./cards";
import {
  countStats,
  filterItems,
  flattenItems,
  pageOf,
  readItemQuery,
  summariseDex,
} from "./items";

const variant = (over: Partial<Variant> = {}): Variant => ({
  id: "row-1",
  rarity: "Common",
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
  collectionId: null,
  ...over,
});

const card = (name: string, variants: Variant[], over: Partial<OwnedCard> = {}): OwnedCard => ({
  key: name,
  name,
  number: "1",
  type: null,
  gen: null,
  image: `/${name}.png`,
  imageHigh: null,
  imageSize: null,
  speciesId: null,
  variants,
  owned: variants.some((v) => v.owned),
  price: null,
  priceHolo: null,
  tcgId: null,
  ...over,
});

const set = (name: string, cards: OwnedCard[]): CardSet => ({
  name,
  title: name,
  logo: null,
  logoSize: null,
  releaseDate: null,
  total: null,
  cards,
});

const SETS: CardSet[] = [
  set("Base Set", [
    card("Pikachu", [variant({ id: "a", quantity: 3, isFavorite: true, collectionId: "f-1" })]),
    card("Charizard", [variant({ id: "b", owned: false })]),
  ]),
  set("Jungle", [card("Snorlax", [variant({ id: "c" }), variant({ id: "d" })])]),
];

describe("flattenItems", () => {
  it("makes one item per copy, in set order, and skips the public shape", () => {
    const sets = [...SETS, set("Public", [card("Mew", [variant({ id: null })])])];
    expect(flattenItems(sets).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("carries the folder, the image and the row's own facts", () => {
    const [pikachu] = flattenItems(SETS);
    expect(pikachu).toMatchObject({
      set: "Base Set",
      image: "/Pikachu.png",
      quantity: 3,
      isFavorite: true,
      collectionId: "f-1",
    });
  });
});

describe("filterItems", () => {
  const items = flattenItems(SETS);
  it("owned=false is the wishlist", () => {
    expect(filterItems(items, { owned: false }).map((i) => i.id)).toEqual(["b"]);
  });
  it("matches a search against the name or the set, in any case", () => {
    expect(filterItems(items, { q: "JUNG" }).map((i) => i.id)).toEqual(["c", "d"]);
    expect(filterItems(items, { q: "pika" }).map((i) => i.id)).toEqual(["a"]);
  });
  it("favourites and folders narrow", () => {
    expect(filterItems(items, { favorite: true }).map((i) => i.id)).toEqual(["a"]);
    expect(filterItems(items, { collection: "f-1" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterItems(items, { collection: "f-2" })).toEqual([]);
  });
});

describe("readItemQuery", () => {
  const read = (qs: string) => readItemQuery(new URLSearchParams(qs));
  it("defaults to the first hundred", () => {
    expect(read("")).toEqual({ kind: "ok", query: { limit: 100, offset: 0 } });
  });
  it("refuses a value it would otherwise have to guess at", () => {
    expect(read("owned=yes").kind).toBe("invalid");
    expect(read("limit=0").kind).toBe("invalid");
    expect(read("collection=not-a-uuid").kind).toBe("invalid");
  });
  it("caps a page at five hundred", () => {
    const r = read("limit=9999&offset=200&owned=true&q=%20pika%20");
    expect(r).toEqual({ kind: "ok", query: { limit: 500, offset: 200, owned: true, q: "pika" } });
  });
});

describe("pageOf", () => {
  it("cuts a page and says how many there were", () => {
    expect(pageOf([1, 2, 3, 4, 5], { limit: 2, offset: 2 })).toEqual({ items: [3, 4], total: 5 });
  });
});

describe("countStats", () => {
  it("counts copies from quantity, cards from rows, and the wishlist apart", () => {
    expect(countStats(SETS)).toEqual({ cards: 3, copies: 5, wishlist: 1, favorites: 1, sets: 2 });
  });
});

describe("summariseDex", () => {
  it("keeps the slot and its first picture, not the cards", () => {
    const dex = [
      {
        id: 25,
        name: "Pikachu",
        owned: 2,
        cards: [card("Pikachu", [], { image: null }), card("Pikachu V", [])],
      },
      { id: 1, name: "Bulbasaur", owned: 0, cards: [] },
    ];
    expect(summariseDex(dex)).toEqual([
      { id: 25, name: "Pikachu", owned: 2, image: "/Pikachu V.png" },
      { id: 1, name: "Bulbasaur", owned: 0, image: null },
    ]);
  });
});
