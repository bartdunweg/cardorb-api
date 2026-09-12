import { ruleMatcher, type FolderRule } from "./folders";
import type { CardSet, OwnedCard, Price, Variant } from "./cards";
import { shownPrice, variantPrice } from "./cards";
import { copyPriceOf, printingKeysOf } from "../price-basis.mjs";
import { heldValue } from "./cards-stats";
import type { Edition, Finish, FoilPattern } from "./collection-row";
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
  /** The code printed on the card: MEW, SFA, DEX. Null where the catalogue names but does not code the set. */
  setAbbr: string | null;
  rarity: string | null;
  gen: string | null;
  type: string | null;
  image: string | null;
  imageHigh: string | null;
  speciesId: number | null;
  /** What the card prints where `name` is the English for it (a Japanese card); null otherwise. */
  localName: string | null;
  tcgId: string | null;
  owned: boolean;
  finish: Finish | null;
  /** What the foil looks like, where anything told us. Null is "not recorded". */
  foilPattern: FoilPattern | null;
  /** Which print run, where somebody said. Null is "not recorded", never "unlimited". */
  edition: Edition | null;
  quantity: number;
  condition: string | null;
  grade: string | null;
  language: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  /** This copy is the one its Pokémon's Pokédex slot shows. */
  dexFace: boolean;
  /** Kept out of the public profile and the latest pull. */
  excluded: boolean;
  acquiredAt: string | null;
  collectionId: string | null;
  price: Price | null;
  /**
   * Always null since 2026-09-12. It was Cardmarket's foil series, and nothing reads Cardmarket
   * for a price any more: a reverse holo's figure is TCGplayer's reverse-holofoil printing, in
   * `printingPrice`. Sent as null rather than dropped so a client that still decodes it (the web
   * app until it stops) keeps working through the deploy, and dropped once none does.
   */
  priceHolo: Price | null;
  /** The stamped first run's price, where TCGplayer prices that run apart. See OwnedCard.priceFirstEd. */
  priceFirstEd?: Price | null;
  /** Always null since 2026-09-12, for the reason `priceHolo` is: it was Cardmarket's product. */
  priceShadowless?: Price | null;
  /**
   * Which market and which printing this copy's figure came from, and where to see it.
   *
   * A figure with no source is a figure nobody can check. So the item says which market
   * answered, which printing of the card it was, and the TCGplayer product id where there is one,
   * which is an address a person can open. There is one market since 2026-09-12, so the answer
   * is "tcgplayer" or nothing; the word stays so a client can say it rather than assume it.
   */
  priceSource?: "tcgplayer" | null;
  pricePrinting?: string | null;
  tcgplayerId?: number | null;
  /**
   * What that printing trades at, in euros.
   *
   * The item sends the card's price fields and the reader works out which of them this copy
   * reads (priceForCopy in cardorb-web's api-shapes.ts), so a figure that is not among those
   * fields cannot be chosen however well this side chose it: #346 picked the printing and the
   * app went on showing the blend of both markets. The chosen printing travels as a price of
   * its own, and the rule on the other side prefers it the way this one does.
   */
  printingPrice?: Price | null;
};

/** One item per copy, in the assembly's order: set by set, number by number. */
/**
 * Everything that makes one copy different from another, as one string.
 *
 * The store keeps one row per kind since fold_card (2026-09-11): a write that would make a
 * second row of a kind folds it into the first. This fold at read time is what did that before
 * the store did, and it stays, because it costs nothing and a row the store has not folded yet
 * (a migration is one run, a write is one call) still reads as one line.
 *
 * Deliberately not in here: purchase price, purchase date, acquired date and notes. Those are
 * facts about a *transaction*, and two copies you cannot tell apart on the shelf are one line
 * whatever you paid for each. fold_card in the store compares the same fields.
 */
const sameness = (v: Variant) =>
  [
    v.owned ? "1" : "0",
    v.language ?? "",
    v.finish ?? "",
    v.foilPattern ?? "",
    // A 1st Edition copy is its own line: it is a different card to a collector and a
    // different figure. The store's fold_card compares the same field.
    v.edition ?? "",
    v.condition ?? "",
    v.grade ?? "",
    v.collectionId ?? "",
    v.isFavorite ? "1" : "0",
  ].join("|");

/**
 * One item per kind of copy, with how many of that kind there are.
 *
 * It was one per row, so a card held four times drew four tiles reading the same name, the same
 * set code and the same price — and paging, totals and the count under the title all counted
 * those four as four different things. Grouped here rather than in the browser because the list
 * is paged: merging tiles after the fact would leave `total` and the offsets describing a
 * different list than the one on screen, and a group could straddle a page.
 *
 * The first row's id leads, so a tap opens the sheet on a real row; the sheet reads the rest.
 */
export function flattenItems(sets: CardSet[]): CardItem[] {
  const out: CardItem[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const groups = new Map<string, CardItem>();
      for (const v of card.variants) {
        // A variant without a row id is a public-payload shape, never a copy
        // somebody can page through or patch.
        if (v.id === null) continue;
        const key = sameness(v);
        const found = groups.get(key);
        if (found) found.quantity += v.quantity ?? 1;
        else groups.set(key, itemOf(set, card, v, v.id));
      }
      out.push(...groups.values());
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
  setAbbr: set.abbreviation,
  rarity: v.rarity,
  gen: card.gen,
  type: card.type,
  image: card.image,
  imageHigh: card.imageHigh,
  speciesId: card.speciesId,
  localName: card.localName ?? null,
  tcgId: card.tcgId,
  owned: v.owned,
  finish: v.finish,
  foilPattern: v.foilPattern,
  edition: v.edition,
  quantity: v.quantity ?? 1,
  condition: v.condition,
  grade: v.grade,
  language: v.language,
  purchasePrice: v.purchasePrice,
  purchaseDate: v.purchaseDate,
  notes: v.notes,
  isFavorite: v.isFavorite,
  dexFace: v.dexFace,
  excluded: v.excluded,
  acquiredAt: v.acquiredAt,
  collectionId: v.collectionId,
  price: card.price,
  priceHolo: null,
  priceFirstEd: card.priceFirstEd ?? null,
  priceShadowless: null,
  ...sourceOf(v, card),
});

/**
 * Which market answered for this copy, which printing of the card it was, and the page it came
 * from. The same order copyPriceOf() reads in, asked a second time: it returns a figure and not
 * where the figure is from, and a price nobody can check is a price nobody believes.
 */
function sourceOf(
  v: Variant,
  card: OwnedCard,
): {
  priceSource: "tcgplayer" | null;
  pricePrinting: string | null;
  tcgplayerId: number | null;
  printingPrice?: Price | null;
} {
  const printing = card.pricePrintings
    ? printingKeysOf(v).find((key) => card.pricePrintings?.[key])
    : undefined;
  if (printing) {
    return {
      priceSource: "tcgplayer",
      pricePrinting: printing,
      tcgplayerId: card.printingIds?.[printing] ?? null,
      printingPrice: card.pricePrintings?.[printing] ?? null,
    };
  }
  // No printing of its own, and still TCGplayer's where there is a figure: the card's price is
  // TCGplayer's since 2026-09-12, and a card it does not price has no source to name.
  const own = copyPriceOf(v, card);
  return { priceSource: own ? "tcgplayer" : null, pricePrinting: null, tcgplayerId: null };
}

/** A filter key that takes several values: a copy matches when it matches any of them. */
export type Several = readonly string[] | string;

/** The asked values, trimmed and lowercased, or null when nothing was asked. */
function wantedOf(v: Several | undefined): ReadonlySet<string> | null {
  const all = (typeof v === "string" ? [v] : (v ?? []))
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return all.length ? new Set(all) : null;
}

export type ItemFilter = {
  /** Matches the card's name or its set, case-insensitively, anywhere in the text. */
  q?: string;
  /** true is the collection, false the wishlist, undefined both. */
  owned?: boolean;
  favorite?: boolean;
  /** A folder id. */
  collection?: string;
  /**
   * One set or several, each whole, as the catalogue names it (`set`) or titles it (`setTitle`);
   * case does not matter. A copy in any of them counts. The query reads an array; a string is one.
   */
  set?: Several;
  /** One rarity or several, each whole, in the catalogue's words; any of them counts, in any case. */
  rarity?: Several;
  /** A card number, whole, as printed; with `set` it names one card's every row. */
  number?: string;
  /** One generation or several, each whole, as the catalogue names its series; any counts, in any case. */
  gen?: Several;
  /** One energy type or several, each whole, as the catalogue names it; any counts, in any case. */
  type?: Several;
  /** true: copies with a price; false: the ones nothing prices, to see what the total leaves out. */
  priced?: boolean;
  /**
   * Only the owned printings held more than once: the copies to trade or sell. A printing is
   * the card, its finish and its run, so a holo and a reverse holo of one card are two printings
   * and neither is a duplicate of the other; condition, grade and language are not part of it.
   * Counted over the items handed in, quantities added up across rows.
   */
  duplicates?: boolean;
  /**
   * The catalogue ids of the full arts, where the route asked for them: a copy counts when its
   * own catalogue id is one. Resolved by the route from the catalogue's copy, because whether a
   * card is full art is a fact about the printing and not about the row (full-art.ts). A row
   * with no catalogue id, or one the copy has never seen, is not a full art here.
   */
  fullArtIds?: ReadonlySet<string>;
  /**
   * A rule folder's rule, resolved by the route from `collection`. Owned copies only,
   * whatever `owned` says: a wished copy is in no folder that fills itself.
   */
  rule?: FolderRule;
};

/**
 * A search word against the card's name, or its set under either name: the one the card was
 * filed under and the official one (`setTitle`). "SVP" found nothing of the SVP promos while
 * their rows were filed as "SV Black Star Promos" — the title is the name a collector knows.
 */
const matchesWord = (it: { name: string; set: string; setTitle: string }, q: string): boolean =>
  it.name.toLowerCase().includes(q) ||
  it.set.toLowerCase().includes(q) ||
  it.setTitle.toLowerCase().includes(q);

/** One printing, as `duplicates` counts it: the catalogue id (the set and number without one), the finish and the run. */
const printingKey = (it: CardItem): string =>
  `${it.tcgId ?? `${it.set}#${it.number}`}|${it.finish ?? ""}|${it.edition ?? ""}`;

export function filterItems(items: CardItem[], f: ItemFilter): CardItem[] {
  let held: Map<string, number> | undefined;
  if (f.duplicates) {
    held = new Map();
    for (const it of items) {
      if (!it.owned) continue;
      held.set(printingKey(it), (held.get(printingKey(it)) ?? 0) + it.quantity);
    }
  }
  const q = f.q?.trim().toLowerCase();
  const set = wantedOf(f.set);
  const rarity = wantedOf(f.rarity);
  const number = f.number?.trim().toLowerCase();
  const gen = wantedOf(f.gen);
  const type = wantedOf(f.type);
  const inRule = f.rule ? ruleMatcher(f.rule) : null;
  return items.filter((it) => {
    if (inRule && !inRule(it)) return false;
    if (f.owned !== undefined && it.owned !== f.owned) return false;
    if (f.favorite && !it.isFavorite) return false;
    if (f.collection && it.collectionId !== f.collection) return false;
    if (set && !set.has(it.set.toLowerCase()) && !set.has(it.setTitle.toLowerCase())) return false;
    if (rarity && !rarity.has((it.rarity ?? "").toLowerCase())) return false;
    if (f.fullArtIds && !(it.tcgId && f.fullArtIds.has(it.tcgId))) return false;
    if (number && it.number.toLowerCase() !== number) return false;
    if (gen && !gen.has((it.gen ?? "").toLowerCase())) return false;
    if (type && !type.has((it.type ?? "").toLowerCase())) return false;
    if (f.priced !== undefined && (copyPrice(it) !== null) !== f.priced) return false;
    if (held && !(it.owned && (held.get(printingKey(it)) ?? 0) > 1)) return false;
    if (q && !matchesWord(it, q)) return false;
    return true;
  });
}

export const SORTS = ["set", "name", "price", "added", "dex"] as const;
export type Sort = (typeof SORTS)[number];
export type Order = "asc" | "desc";

/**
 * What a copy is worth: the TCGplayer printing it is, where that was priced, and the card's own
 * figure otherwise. The rule itself is copyPriceOf() in price-basis.mjs; an item carries the
 * printing it chose as `printingPrice` rather than every printing, so that is read first here.
 * Without it, a reverse holo item sorted and totalled at the plain card's price.
 */
export const copyPrice = (it: CardItem): number | null =>
  shownPrice(it.printingPrice ?? copyPriceOf(it, it));

export type ListValue = { value: number; unpriced: number; copies: number };

/**
 * How many cards a list is, counted the way a person counts them: an owned copy `quantity`
 * times, a wish once. The one number every screen says for a list since 2026-09-11 — the
 * collection read 1,915 (rows), the public page 1,609 (distinct cards) and Home 1,933 (this)
 * about the same binder, and each was right about something else.
 */
export function countCopies(items: CardItem[]): number {
  let n = 0;
  for (const it of items) n += it.owned ? Math.max(0, it.quantity) : 1;
  return n;
}

/**
 * What a list is worth: over the whole filtered list, never a page, so the figure is for the
 * cards a person asked about and not for the hundred that happened to load. An owned copy
 * counts `quantity` times, a wish once; `unpriced` counts the copies no price was found for,
 * the same convention as countStats(). Euros to the cent.
 */
export function sumValue(items: CardItem[]): ListValue {
  let value = 0;
  let unpriced = 0;
  for (const it of items) {
    const n = it.owned ? Math.max(0, it.quantity) : 1;
    const price = copyPrice(it);
    if (price == null) unpriced += n;
    else value += price * n;
  }
  return { value: Math.round(value * 100) / 100, unpriced, copies: countCopies(items) };
}

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
  // `dex`: the national number; a trainer or energy has none and goes last like any missing key.
  const key = (it: CardItem): string | number | null =>
    sort === "name"
      ? it.name
      : sort === "price"
        ? copyPrice(it)
        : sort === "dex"
          ? it.speciesId
          : it.acquiredAt;
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

/**
 * An owner's page: up to the whole collection in one request, for the Pokédex, which needs
 * every card and used to fetch it in four pages of 500. A public page stays at 500 (PUBLIC_PAGE).
 */
export const PAGE = { default: 100, max: 2000 } as const;
export const PUBLIC_PAGE_MAX = 500;

export type Page = { limit: number; offset: number };

/** How many values one of `set`, `rarity`, `gen` or `type` may be repeated with. */
export const MAX_VALUES = 50;

export type ItemQuery = Omit<ItemFilter, "set" | "rarity" | "gen" | "type"> &
  Page & {
    /** As asked, trimmed and without repeats: one value is an array of one. */
    set?: string[];
    rarity?: string[];
    gen?: string[];
    type?: string[];
    sort?: Sort;
    order?: Order;
    /**
     * `?fullArt=1`, as asked. The route turns it into `fullArtIds` by asking the catalogue's
     * copy; the filter itself never reaches a store.
     */
    fullArt?: boolean;
  };

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
  if (params.get("fullArt") === "1") query.fullArt = true;
  if (params.get("duplicates") === "1") query.duplicates = true;
  for (const key of ["owned", "favorite", "priced"] as const) {
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
  const number = params.get("number");
  if (number !== null) {
    if (!number.trim() || number.length > 100)
      return { kind: "invalid", error: "number must name one." };
    query.number = number.trim();
  }
  // Repeated for several (`?rarity=Rare&rarity=Rare%20Holo`): a copy matching any of them counts.
  // One is still one, as the iOS app sends it; each is held to what one always was.
  for (const key of ["set", "rarity", "gen", "type"] as const) {
    const vs = params.getAll(key);
    if (vs.length === 0) continue;
    if (vs.length > MAX_VALUES) return { kind: "invalid", error: `${key} names too many.` };
    const names: string[] = [];
    for (const v of vs) {
      if (!v.trim() || v.length > 100) return { kind: "invalid", error: `${key} must name one.` };
      if (!names.includes(v.trim())) names.push(v.trim());
    }
    query[key] = names;
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
 *
 * ── Two things this is not, both inherited from the tally it replaced ──────
 *
 * `value` is on the shown price, which is what a single copy trades at, and not
 * on Cardmarket's `low`. That is a measurement rather than a preference: `low`
 * is the cheapest listing at any condition in any language, 421 of this
 * collection's 1,211 priced cards list under €0.10 because their cheapest
 * listing is a bulk lot, and the same cards totalled €9,355 that way against
 * €25,880 valued one at a time. A third of the binder as a rounding error.
 *
 * There is no `movement` here, and there is not going to be one out of a Price.
 * The obvious version — today's `market` against `avg30` — is wrong on a
 * blended price, which is every price this app carries: `market` is the average
 * of Cardmarket's Near Mint estimate and TCGplayer's dollars in euros while
 * `avg30` stays Cardmarket's raw month, so a card that has not moved reports
 * +13.75%. It cost getCardsStats() its life (see ./cards-stats.ts). "What
 * moved" is answered by ./movers.ts, out of the recorded daily readings, where
 * both sides of the comparison are the same measurement taken twice.
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
  /** The larger scan, where the catalogue has two sizes; a tile on a phone draws it. */
  imageHigh: string | null;
  speciesId: number | null;
  /**
   * What the card prints where `name` is the English for it (a Japanese card); null otherwise.
   * Optional in the type, not the answer: the fixtures that build one by hand predate it.
   */
  localName?: string | null;
  tcgId: string | null;
  /** Owned copies. A card with only wishes is not on a public page. */
  copies: number;
  /** One of the owned copies is starred. Always false on a wish. */
  favorite: boolean;
  /**
   * One of the owned copies leads this Pokémon's Pokédex slot: the picture a visitor's Pokédex
   * opens on. Always false on a wish, which no Pokédex slot shows.
   */
  dexFace: boolean;
};

/**
 * The owned cards as a public list. `newestFirst` orders by the day each card was got, which is
 * what a profile opens on; a card nobody dated goes last, as it does in the owner's own list.
 */
export function publicItems(sets: CardSet[], { newestFirst = false } = {}): PublicItem[] {
  const dated: { item: PublicItem; at: number }[] = [];
  const out: PublicItem[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      // Copies as a person counts them — a row's quantity, not the rows — the way every list
      // counts since 2026-09-11. The public shape carries no quantity (forPublic), so from it
      // this is the rows, and the public cards route lays the true count over each item.
      let copies = 0;
      for (const v of card.variants) if (v.owned) copies += Math.max(0, v.quantity ?? 1);
      if (copies === 0) continue;
      const at = card.variants
        .filter((v) => v.owned && v.acquiredAt)
        .reduce((newest, v) => Math.max(newest, Date.parse(v.acquiredAt!) || 0), 0);
      const item: PublicItem = {
        key: card.key,
        name: card.name,
        number: card.number,
        set: set.name,
        setTitle: set.title,
        rarity: card.variants.find((v) => v.owned)?.rarity ?? null,
        gen: card.gen,
        type: card.type,
        image: card.image,
        imageHigh: card.imageHigh,
        speciesId: card.speciesId,
        localName: card.localName ?? null,
        tcgId: card.tcgId,
        copies,
        favorite: card.variants.some((v) => v.owned && v.isFavorite),
        dexFace: card.variants.some((v) => v.owned && v.dexFace),
      };
      if (newestFirst) dated.push({ item, at });
      else out.push(item);
    }
  }
  if (!newestFirst) return out;
  // A card without a date is a card whose day nobody wrote down: it goes after the dated ones,
  // in the order the assembly listed it, rather than pretending to be the oldest.
  return dated.sort((a, b) => b.at - a.at || 0).map((d) => d.item);
}

/**
 * The wishes as public items: one per card the owner is looking for, `copies` the wishes. Only
 * for an owner who shows the wishlist; a card held as well is not a wish.
 */
export function publicWishes(sets: CardSet[]): PublicItem[] {
  const out: PublicItem[] = [];
  for (const set of sets) {
    for (const card of set.cards) {
      if (card.variants.some((v) => v.owned)) continue;
      const copies = card.variants.filter((v) => !v.owned).length;
      if (copies === 0) continue;
      out.push({
        key: card.key,
        name: card.name,
        number: card.number,
        set: set.name,
        setTitle: set.title,
        rarity: card.variants[0]?.rarity ?? null,
        gen: card.gen,
        type: card.type,
        image: card.image,
        imageHigh: card.imageHigh,
        speciesId: card.speciesId,
        localName: card.localName ?? null,
        tcgId: card.tcgId,
        copies,
        favorite: false,
        // A wish is not in anybody's Pokédex: the slots hold cards you own.
        dexFace: false,
      });
    }
  }
  return out;
}

/** What a visitor can narrow a public collection by: the same words as `ItemFilter`, minus what is personal. */
export type PublicFilter = Pick<ItemFilter, "q" | "set" | "rarity">;

export function filterPublicItems(items: PublicItem[], f: PublicFilter): PublicItem[] {
  const q = f.q?.trim().toLowerCase();
  const set = wantedOf(f.set);
  const rarity = wantedOf(f.rarity);
  return items.filter((it) => {
    if (set && !set.has(it.set.toLowerCase()) && !set.has(it.setTitle.toLowerCase())) return false;
    if (rarity && !rarity.has((it.rarity ?? "").toLowerCase())) return false;
    if (q && !matchesWord(it, q)) return false;
    return true;
  });
}

/** A public page carries no price and no date, so it sorts by set order or by name only. */
/**
 * What a public list may be sorted by. "added" is newest first: the profile opens on what its
 * owner pulled last. The date itself stays off the wire — `publicItems` orders by it and drops
 * it, so a visitor learns which card is newest without learning when every card was got.
 */
export const PUBLIC_SORTS = ["set", "name", "added"] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

export function sortPublicItems(
  items: PublicItem[],
  sort: PublicSort = "set",
  order: Order = "asc",
): PublicItem[] {
  const dir = order === "asc" ? 1 : -1;
  // Both orders arrive built: "set" is the assembly's, ascending, and "added" is publicItems()'s,
  // newest first, which is `desc`. So each is the identity in its own direction and a reversal in
  // the other — the dates that would let this sort them are not on a public item.
  const given = sort === "added" ? "desc" : "asc";
  if (sort === "set" || sort === "added") return order === given ? items : [...items].reverse();
  const indexed = items.map((it, i) => ({ it, i }));
  indexed.sort((a, b) => a.it.name.localeCompare(b.it.name) * dir || a.i - b.i);
  return indexed.map((x) => x.it);
}

export type Facets = {
  sets: { name: string; title: string }[];
  rarities: string[];
  gens: string[];
  types: string[];
};
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
  items: {
    set: string;
    setTitle: string;
    rarity: string | null;
    gen?: string | null;
    type?: string | null;
    owned?: boolean;
  }[],
  /** `owned: false` draws the menus from the wishes instead: a wishlist filters by its own sets. */
  over: { owned?: boolean } = {},
): Facets {
  const sets = new Map<string, string>();
  const rarities = new Map<string, string>();
  // Generations keep the order the collection lists them in — the catalogue's series order,
  // which is chronological. Types and rarities are named things with no order of their own,
  // so they go A to Z.
  const gens = new Map<string, string>();
  const types = new Map<string, string>();
  const wanted = over.owned === false ? false : true;
  for (const it of items) {
    if ((it.owned ?? true) !== wanted) continue;
    if (!sets.has(it.set)) sets.set(it.set, it.setTitle);
    if (it.rarity && !rarities.has(it.rarity.toLowerCase()))
      rarities.set(it.rarity.toLowerCase(), it.rarity);
    if (it.gen && !gens.has(it.gen.toLowerCase())) gens.set(it.gen.toLowerCase(), it.gen);
    if (it.type && !types.has(it.type.toLowerCase())) types.set(it.type.toLowerCase(), it.type);
  }
  return {
    sets: [...sets].map(([name, title]) => ({ name, title })),
    rarities: [...rarities.values()].sort((a, b) => a.localeCompare(b)),
    gens: [...gens.values()],
    types: [...types.values()].sort((a, b) => a.localeCompare(b)),
  };
}

export const publicFacets = (items: PublicItem[]): PublicFacets => facetsOf(items);

/** The lists beside the collection an owner can show: each behind its own flag on the profile. */
export const PUBLIC_LISTS = ["wishlist", "favorites"] as const;
export type PublicList = (typeof PUBLIC_LISTS)[number];

export type PublicQuery = PublicFilter &
  Page & { sort?: PublicSort; order?: Order; collection?: string; list?: PublicList };

/**
 * `q`, `set` and `rarity` (either repeated for several), `sort`, `order`, `limit` and `offset`:
 * a public page has no wishlist, favourites or folders, and no price or date to sort by. Read as
 * strictly as the owner's list.
 */
export function readPublicQuery(
  params: URLSearchParams,
): { kind: "ok"; query: PublicQuery } | { kind: "invalid"; error: string } {
  const kept = ["q", "set", "rarity", "sort", "order", "limit", "offset", "collection"];
  const list = params.get("list");
  if (list !== null && !(PUBLIC_LISTS as readonly string[]).includes(list))
    return { kind: "invalid", error: `list must be one of ${PUBLIC_LISTS.join(", ")}.` };
  const sort = params.get("sort");
  if (sort !== null && !(PUBLIC_SORTS as readonly string[]).includes(sort))
    return { kind: "invalid", error: `sort must be one of ${PUBLIC_SORTS.join(", ")}.` };
  // Pairs, not an object: an object keeps one `set` of several and drops the rest.
  const read = readItemQuery(
    new URLSearchParams([...params.entries()].filter(([k]) => kept.includes(k))),
  );
  if (read.kind === "invalid") return read;
  const { q, set, rarity, order, offset, collection } = read.query;
  const limit = Math.min(read.query.limit, PUBLIC_PAGE_MAX);
  return {
    kind: "ok",
    query: {
      ...(q ? { q } : {}),
      ...(set?.length ? { set } : {}),
      ...(rarity?.length ? { rarity } : {}),
      ...(collection ? { collection } : {}),
      ...(list ? { list: list as PublicList } : {}),
      ...(sort ? { sort: sort as PublicSort } : {}),
      ...(order ? { order } : {}),
      limit,
      offset,
    },
  };
}
