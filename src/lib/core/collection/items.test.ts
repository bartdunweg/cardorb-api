import { describe, expect, it } from "vitest";
import type { CardSet, OwnedCard, Price, Variant } from "./cards";
import {
  countStats,
  filterItems,
  filterPublicItems,
  flattenItems,
  pageOf,
  publicItems,
  readItemQuery,
  readPublicQuery,
  sortItems,
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
  it("a set or a rarity is matched whole, in any case", () => {
    expect(filterItems(items, { set: "jungle" }).map((i) => i.id)).toEqual(["c", "d"]);
    expect(filterItems(items, { set: "Jung" })).toEqual([]);
    expect(filterItems(items, { rarity: "common" }).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterItems(items, { rarity: "Rare" })).toEqual([]);
  });
});

describe("sortItems", () => {
  const price = { market: 2, nm: { low: 1.8, mid: 2, high: 2.2 } } as unknown as Price;
  const priceHolo = { market: 5, nm: { low: 4.5, mid: 5, high: 5.5 } } as unknown as Price;
  const sets: CardSet[] = [
    set("Base Set", [
      card("Pikachu", [variant({ id: "a", acquiredAt: "2026-01-02" })], { price }),
      card("Charizard", [variant({ id: "b", acquiredAt: "2026-03-01" })]),
    ]),
    set("Jungle", [
      card(
        "Snorlax",
        [
          variant({ id: "c", acquiredAt: "2026-02-01" }),
          // A holo takes the plain price and a reverse holo the foil price,
          // the same rule variantPrice() in cards.ts applies everywhere else:
          // a card that exists only as a holo is what the plain fields
          // already describe, and the `-holo` fields there are a thinner,
          // different market.
          variant({ id: "d", finish: "holo", acquiredAt: null }),
          variant({ id: "e", finish: "reverse-holo", acquiredAt: null }),
        ],
        { price, priceHolo },
      ),
    ]),
  ];
  const items = flattenItems(sets);
  const ids = (sort: Parameters<typeof sortItems>[1], order?: Parameters<typeof sortItems>[2]) =>
    sortItems(items, sort, order).map((i) => i.id);

  it("set order is the order the assembly came in, and desc reverses it", () => {
    expect(ids("set")).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids("set", "desc")).toEqual(["e", "d", "c", "b", "a"]);
  });
  it("by name, with set order breaking a tie", () => {
    expect(ids("name")).toEqual(["b", "a", "c", "d", "e"]);
  });
  it("by price, the copy's own printing, and the unpriced last either way", () => {
    expect(ids("price")).toEqual(["a", "c", "d", "e", "b"]);
    expect(ids("price", "desc")).toEqual(["e", "a", "c", "d", "b"]);
  });
  it("by the day it was added, newest first by default, and the undated last", () => {
    expect(ids("added")).toEqual(["b", "c", "a", "d", "e"]);
    expect(ids("added", "asc")).toEqual(["a", "c", "b", "d", "e"]);
  });
  it("does not touch the list it was given", () => {
    const before = items.map((i) => i.id);
    sortItems(items, "name");
    expect(items.map((i) => i.id)).toEqual(before);
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
  it("reads a sort, an order, a set and a rarity, and refuses what it cannot mean", () => {
    expect(read("sort=price&order=desc&set=Jungle&rarity=Rare")).toEqual({
      kind: "ok",
      query: { limit: 100, offset: 0, sort: "price", order: "desc", set: "Jungle", rarity: "Rare" },
    });
    expect(read("sort=colour").kind).toBe("invalid");
    expect(read("order=up").kind).toBe("invalid");
    expect(read("set=").kind).toBe("invalid");
  });
});

describe("pageOf", () => {
  it("cuts a page and says how many there were", () => {
    expect(pageOf([1, 2, 3, 4, 5], { limit: 2, offset: 2 })).toEqual({ items: [3, 4], total: 5 });
  });
});

describe("countStats", () => {
  it("counts copies from quantity, cards from rows, and the wishlist apart", () => {
    expect(countStats(SETS)).toEqual({
      cards: 3,
      copies: 5,
      wishlist: 1,
      favorites: 1,
      sets: 2,
      value: 0,
      unpriced: 5,
    });
  });

  it("values the copies held at today's price, printing by printing, and counts the unpriced apart", () => {
    const price = { market: 2, nm: { low: 1.8, mid: 2, high: 2.2 } } as unknown as Price;
    const priceHolo = { market: 5, nm: { low: 4.5, mid: 5, high: 5.5 } } as unknown as Price;
    const sets: CardSet[] = [
      {
        ...(SETS[0] as CardSet),
        cards: [
          card(
            "Priced",
            [variant({ quantity: 2 }), variant({ id: "v2", finish: "reverse-holo", quantity: 1 })],
            { price, priceHolo },
          ),
          card("Unpriced", [variant({ quantity: 3 })]),
        ],
      },
    ];
    const stats = countStats(sets);
    expect(stats.value).toBe(9);
    expect(stats.unpriced).toBe(3);
    expect(stats.copies).toBe(6);
  });
});

describe("summariseDex", () => {
  it("keeps the slot and its cards as name and picture, not the rows", () => {
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
      {
        id: 25,
        name: "Pikachu",
        owned: 2,
        cards: [
          { key: "Pikachu", name: "Pikachu", image: null },
          { key: "Pikachu V", name: "Pikachu V", image: "/Pikachu V.png" },
        ],
      },
      { id: 1, name: "Bulbasaur", owned: 0, cards: [] },
    ]);
  });
});

describe("publicItems", () => {
  it("shows one entry per card with owned copies, and never a card that is only wished for", () => {
    const items = publicItems(SETS);
    expect(items.map((i) => [i.name, i.copies])).toEqual([
      ["Pikachu", 1],
      ["Snorlax", 2],
    ]);
    expect(Object.keys(items[0] ?? {})).not.toContain("purchasePrice");
  });

  it("searches by name or set, and reads only q, limit and offset", () => {
    expect(filterPublicItems(publicItems(SETS), "jungle").map((i) => i.name)).toEqual(["Snorlax"]);
    expect(readPublicQuery(new URLSearchParams("q=x&owned=false&limit=5"))).toEqual({
      kind: "ok",
      query: { q: "x", limit: 5, offset: 0 },
    });
  });
});
