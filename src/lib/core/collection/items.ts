import type { CardSet, OwnedCard, Price, Variant } from "./cards";
import { shownPrice, variantPrice } from "./cards";
import { heldValue } from "./cards-stats";
import type { DexEntry } from "./pokedex";
import type { Finish } from "./collection-row";
import { UUID } from "./collection-row";

/**
 * The collection as a flat list of copies, for a screen that pages through it.
 *
 * `GET /v1/collection` answers with the whole thing grouped by set — right for
 * the iOS app, which draws sets, and sixteen hundred cards heavy for a web
 * page that shows a hundred at a time with a search box. This module reads the
 * same assembly (already built and cached per person) and hands back one page
 * of it, so the cost of a page is a filter over memory and not a rebuild.
 *
 * Decisions live here rather than in the route so a test can reach them: what
 * a search matches, what "owned" means, how a page is cut.
 */

export type CardItem = {
  /** The collection row, for `PATCH /v1/collection/items/{id}`. */
  id: string;
  name: string;
  number: string;
  /** The set's name as the catalogue spells it, and its title for a heading. */
  set: string;
  setTitle: string;
  rarity: string | null;
  gen: string | null;
  type: string | null;
  image: string | null;
  imageHigh: string | null;
  speciesId: number | null;
  tcgId: string | null;
  owned: boolean;
  finish: Finish | null;
  quantity: number;
  condition: string | null;
  grade: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  acquiredAt: string | null;
  collectionId: string | null;
  price: Price | null;
  priceHolo: Price | null;
};

/** One item per copy, in the assembly's order: set by set, number by number. */
export function flattenItems(sets: CardSet[]): CardItem[] {
  const out: CardItem[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      for (const v of card.variants) {
        // A variant without a row id is a public-payload shape, never a copy
        // somebody can page through or patch.
        if (v.id === null) continue;
        out.push(itemOf(set, card, v, v.id));
      }
    }
  }
  return out;
}

const itemOf = (set: CardSet, card: OwnedCard, v: Variant, id: string): CardItem => ({
  id,
  name: card.name,
  number: card.number,
  set: set.name,
  setTitle: set.title,
  rarity: v.rarity,
  gen: card.gen,
  type: card.type,
  image: card.image,
  imageHigh: card.imageHigh,
  speciesId: card.speciesId,
  tcgId: card.tcgId,
  owned: v.owned,
  finish: v.finish,
  quantity: v.quantity ?? 1,
  condition: v.condition,
  grade: v.grade,
  purchasePrice: v.purchasePrice,
  purchaseDate: v.purchaseDate,
  notes: v.notes,
  isFavorite: v.isFavorite,
  acquiredAt: v.acquiredAt,
  collectionId: v.collectionId,
  price: card.price,
  priceHolo: card.priceHolo,
});

export type ItemFilter = {
  /** Matches the card's name or its set, case-insensitively, anywhere in the text. */
  q?: string;
  /** true is the collection, false the wishlist, undefined both. */
  owned?: boolean;
  favorite?: boolean;
  /** A folder id. */
  collection?: string;
  /** A set, whole, as the catalogue names it (`set`) or titles it (`setTitle`); case does not matter. */
  set?: string;
  /** A rarity, whole, in the catalogue's words; case does not matter. */
  rarity?: string;
};

export function filterItems(items: CardItem[], f: ItemFilter): CardItem[] {
  const q = f.q?.trim().toLowerCase();
  const set = f.set?.trim().toLowerCase();
  const rarity = f.rarity?.trim().toLowerCase();
  return items.filter((it) => {
    if (f.owned !== undefined && it.owned !== f.owned) return false;
    if (f.favorite && !it.isFavorite) return false;
    if (f.collection && it.collectionId !== f.collection) return false;
    if (set && it.set.toLowerCase() !== set && it.setTitle.toLowerCase() !== set) return false;
    if (rarity && (it.rarity ?? "").toLowerCase() !== rarity) return false;
    if (q && !it.name.toLowerCase().includes(q) && !it.set.toLowerCase().includes(q)) return false;
    return true;
  });
}

export const SORTS = ["set", "name", "price", "added"] as const;
export type Sort = (typeof SORTS)[number];
export type Order = "asc" | "desc";

/**
 * What a copy is worth: the foil price for a reverse holo, the plain price for
 * everything else — the same rule as variantPrice() in cards.ts, which says
 * why `holo` does not read the foil fields. This used to read them for `holo`
 * too, so the sort valued a holo copy differently from every other figure.
 */
const copyPrice = (it: CardItem): number | null =>
  shownPrice((it.finish === "reverse-holo" ? it.priceHolo : null) ?? it.price);

/**
 * A new list in the asked order. `set` is the assembly's own order (set by set,
 * number by number), which is what the list shows when nobody asked. Within
 * any sort that order breaks a tie, so two equal names keep their places.
 *
 * Each sort has the direction a person means when they do not say: a price
 * or a name reads up, "added" reads newest first. A copy that has no value
 * for the key (no price, no date) goes last whichever way the list runs;
 * putting it first on `desc` would head a list of dearest cards with the
 * ones nobody could price.
 */
export function sortItems(items: CardItem[], sort: Sort = "set", order?: Order): CardItem[] {
  const dir = (order ?? (sort === "added" ? "desc" : "asc")) === "asc" ? 1 : -1;
  const indexed = items.map((it, i) => ({ it, i }));
  if (sort === "set") {
    return (dir === 1 ? indexed : indexed.reverse()).map((x) => x.it);
  }
  const key = (it: CardItem): string | number | null =>
    sort === "name" ? it.name : sort === "price" ? copyPrice(it) : it.acquiredAt;
  indexed.sort((a, b) => {
    const ka = key(a.it);
    const kb = key(b.it);
    if (ka === null && kb === null) return a.i - b.i;
    if (ka === null) return 1;
    if (kb === null) return -1;
    const c =
      typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb));
    return c !== 0 ? c * dir : a.i - b.i;
  });
  return indexed.map((x) => x.it);
}

export const PAGE = { default: 100, max: 500 } as const;

export type Page = { limit: number; offset: number };

export type ItemQuery = ItemFilter & Page & { sort?: Sort; order?: Order };

/**
 * The query string, read strictly: an unknown value is an error rather than
 * a silent default, because a client that sent `owned=yes` and got the whole
 * collection back would have no way to notice.
 */
export function readItemQuery(
  params: URLSearchParams,
): { kind: "ok"; query: ItemQuery } | { kind: "invalid"; error: string } {
  const query: ItemQuery = { limit: PAGE.default, offset: 0 };

  const q = params.get("q");
  if (q !== null) {
    if (q.length > 100) return { kind: "invalid", error: "q is too long." };
    if (q.trim()) query.q = q.trim();
  }
  for (const key of ["owned", "favorite"] as const) {
    const v = params.get(key);
    if (v === null) continue;
    if (v !== "true" && v !== "false")
      return { kind: "invalid", error: `${key} must be true or false.` };
    query[key] = v === "true";
  }
  const collection = params.get("collection");
  if (collection !== null) {
    if (!UUID.test(collection))
      return { kind: "invalid", error: "collection must be a folder id." };
    query.collection = collection;
  }
  for (const key of ["set", "rarity"] as const) {
    const v = params.get(key);
    if (v === null) continue;
    if (!v.trim() || v.length > 100) return { kind: "invalid", error: `${key} must name one.` };
    query[key] = v.trim();
  }
  const sort = params.get("sort");
  if (sort !== null) {
    if (!(SORTS as readonly string[]).includes(sort))
      return { kind: "invalid", error: `sort must be one of ${SORTS.join(", ")}.` };
    query.sort = sort as Sort;
  }
  const order = params.get("order");
  if (order !== null) {
    if (order !== "asc" && order !== "desc")
      return { kind: "invalid", error: "order must be asc or desc." };
    query.order = order;
  }
  for (const key of ["limit", "offset"] as const) {
    const v = params.get(key);
    if (v === null) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < (key === "limit" ? 1 : 0)) {
      return { kind: "invalid", error: `${key} must be a whole number.` };
    }
    query[key] = key === "limit" ? Math.min(n, PAGE.max) : n;
  }
  return { kind: "ok", query };
}

export function pageOf<T>(items: T[], page: Page): { items: T[]; total: number } {
  return { items: items.slice(page.offset, page.offset + page.limit), total: items.length };
}

/**
 * The dashboard's numbers. Copies count what is held (`quantity`), cards count
 * rows: a person with three of one card has three copies and one card.
 *
 * `value` is what the copies held trade at today, in euros, printing by
 * printing (heldValue(), the same sum the value tile and the nightly snapshot
 * use — R-DATA-006). It is a whole-collection figure, which is why it lives
 * here rather than on a page of a hundred cards: summing a page would state a
 * value for a collection it had not seen. `unpriced` is how many of those
 * copies Cardmarket has no number for, so a reader can tell "€900" from
 * "€900 plus whatever these 40 are worth".
 */
export type Stats = {
  cards: number;
  copies: number;
  wishlist: number;
  favorites: number;
  /** Sets with at least one owned copy. */
  sets: number;
  /** Today's value of every copy held, in euros, to the cent. */
  value: number;
  /** Copies held that carry no price and so add nothing to `value`. */
  unpriced: number;
};

export function countStats(sets: CardSet[]): Stats {
  const stats: Stats = {
    cards: 0,
    copies: 0,
    wishlist: 0,
    favorites: 0,
    sets: 0,
    value: 0,
    unpriced: 0,
  };
  for (const set of sets) {
    let ownedHere = false;
    for (const card of set.cards) {
      for (const v of card.variants) {
        if (v.id === null) continue;
        if (!v.owned) {
          stats.wishlist += 1;
          continue;
        }
        ownedHere = true;
        stats.cards += 1;
        stats.copies += v.quantity ?? 1;
        if (v.isFavorite) stats.favorites += 1;
        if (shownPrice(variantPrice(card, v)) == null)
          stats.unpriced += Math.max(0, v.quantity ?? 1);
      }
      stats.value += heldValue(card);
    }
    if (ownedHere) stats.sets += 1;
  }
  stats.value = Math.round(stats.value * 100) / 100;
  return stats;
}

/**
 * A Pokédex slot for a 1,025-tile grid: a count, and the owned cards of that
 * Pokémon as name and picture only. The row-level facts stay on `GET /v1/cards`.
 */
export type DexCard = { key: string; name: string; image: string | null };
export type DexSummary = { id: number; name: string; owned: number; cards: DexCard[] };

export function summariseDex(dex: DexEntry[]): DexSummary[] {
  return dex.map((e) => ({
    id: e.id,
    name: e.name,
    owned: e.owned,
    cards: e.cards.map((c) => ({ key: c.key, name: c.name, image: c.image })),
  }));
}

/**
 * One entry per card on a public profile: what a stranger may see, and how
 * many copies the owner holds — never the copies themselves. Read from the
 * public payload (forPublic), where every private field is already gone.
 */
export type PublicItem = {
  key: string;
  name: string;
  number: string;
  set: string;
  setTitle: string;
  rarity: string | null;
  gen: string | null;
  type: string | null;
  image: string | null;
  speciesId: number | null;
  tcgId: string | null;
  /** Owned copies. A card with only wishes is not on a public page. */
  copies: number;
};

export function publicItems(sets: CardSet[]): PublicItem[] {
  const out: PublicItem[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const copies = card.variants.filter((v) => v.owned).length;
      if (copies === 0) continue;
      out.push({
        key: card.key,
        name: card.name,
        number: card.number,
        set: set.name,
        setTitle: set.title,
        rarity: card.variants.find((v) => v.owned)?.rarity ?? null,
        gen: card.gen,
        type: card.type,
        image: card.image,
        speciesId: card.speciesId,
        tcgId: card.tcgId,
        copies,
      });
    }
  }
  return out;
}

/** What a visitor can narrow a public collection by: the same words as `ItemFilter`, minus what is personal. */
export type PublicFilter = Pick<ItemFilter, "q" | "set" | "rarity">;

export function filterPublicItems(items: PublicItem[], f: PublicFilter): PublicItem[] {
  const q = f.q?.trim().toLowerCase();
  const set = f.set?.trim().toLowerCase();
  const rarity = f.rarity?.trim().toLowerCase();
  return items.filter((it) => {
    if (set && it.set.toLowerCase() !== set && it.setTitle.toLowerCase() !== set) return false;
    if (rarity && (it.rarity ?? "").toLowerCase() !== rarity) return false;
    if (q && !it.name.toLowerCase().includes(q) && !it.set.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** A public page carries no price and no date, so it sorts by set order or by name only. */
export const PUBLIC_SORTS = ["set", "name"] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

export function sortPublicItems(
  items: PublicItem[],
  sort: PublicSort = "set",
  order: Order = "asc",
): PublicItem[] {
  const dir = order === "asc" ? 1 : -1;
  if (sort === "set") return dir === 1 ? items : [...items].reverse();
  const indexed = items.map((it, i) => ({ it, i }));
  indexed.sort((a, b) => a.it.name.localeCompare(b.it.name) * dir || a.i - b.i);
  return indexed.map((x) => x.it);
}

export type Facets = { sets: { name: string; title: string }[]; rarities: string[] };
export type PublicFacets = Facets;

/**
 * What a filter menu can offer over a whole collection: its sets in set order, its rarities
 * A to Z. The catalogues spell a rarity two ways ("Illustration rare", "Illustration Rare");
 * the filter matches either, so the menu names each rarity once, in its first spelling.
 *
 * Over the owned copies only: a wishlist card puts no set in the menu of what you hold. The
 * public list is owned copies by construction; the owner's list says so per item.
 */
export function facetsOf(
  items: { set: string; setTitle: string; rarity: string | null; owned?: boolean }[],
): Facets {
  const sets = new Map<string, string>();
  const rarities = new Map<string, string>();
  for (const it of items) {
    if (it.owned === false) continue;
    if (!sets.has(it.set)) sets.set(it.set, it.setTitle);
    if (it.rarity && !rarities.has(it.rarity.toLowerCase()))
      rarities.set(it.rarity.toLowerCase(), it.rarity);
  }
  return {
    sets: [...sets].map(([name, title]) => ({ name, title })),
    rarities: [...rarities.values()].sort((a, b) => a.localeCompare(b)),
  };
}

export const publicFacets = (items: PublicItem[]): PublicFacets => facetsOf(items);

export type PublicQuery = PublicFilter & Page & { sort?: PublicSort; order?: Order };

/**
 * `q`, `set`, `rarity`, `sort`, `order`, `limit` and `offset`: a public page has no wishlist,
 * favourites or folders, and no price or date to sort by. Read as strictly as the owner's list.
 */
export function readPublicQuery(
  params: URLSearchParams,
): { kind: "ok"; query: PublicQuery } | { kind: "invalid"; error: string } {
  const kept = ["q", "set", "rarity", "sort", "order", "limit", "offset"];
  const sort = params.get("sort");
  if (sort !== null && !(PUBLIC_SORTS as readonly string[]).includes(sort))
    return { kind: "invalid", error: `sort must be one of ${PUBLIC_SORTS.join(", ")}.` };
  const read = readItemQuery(
    new URLSearchParams(
      Object.fromEntries([...params.entries()].filter(([k]) => kept.includes(k))),
    ),
  );
  if (read.kind === "invalid") return read;
  const { q, set, rarity, order, limit, offset } = read.query;
  return {
    kind: "ok",
    query: {
      ...(q ? { q } : {}),
      ...(set ? { set } : {}),
      ...(rarity ? { rarity } : {}),
      ...(sort ? { sort: sort as PublicSort } : {}),
      ...(order ? { order } : {}),
      limit,
      offset,
    },
  };
}
