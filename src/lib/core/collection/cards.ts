/**
 * The whole card collection, grouped by set. Everything binder shows is a view
 * of what this returns.
 *
 * It came from the portfolio at bartdunweg.com, where it fed /cards, and it is
 * the reason this project starts with something rather than with a scaffold:
 * two years of matching a hand-kept Notion database against three card
 * catalogues live in here, and none of that is worth writing twice. The parts
 * that were about that site (its image manifest, its cover-art resolver) are in
 * ./util now, hollowed out, with a note saying what they used to do.
 *
 * The unit is the set, not the card. Resolving one card at a time costs one to
 * four requests, which is the right trade for a single cover and the wrong one
 * for a collection: a few hundred cards would mean a few hundred round trips on
 * every revalidation. TCGdex returns every card in a set, with its image, in
 * one response, so the cost scales with the number of sets pulled from rather
 * than the number of cards owned. Only the cards that miss fall back to a
 * per-card lookup.
 *
 * It does not know where the collection is kept. It is handed CollectionRows
 * and matches them against the catalogues; lib/storage decides who answered and
 * lib/core/collection/collection.ts is what asks. That split is recent — this file used to
 * open with a Notion query and carry Notion property bags four hundred lines
 * down into the per-card map — and the reason for it is that there is about to
 * be more than one collection, kept somewhere else, and none of the matching
 * below has an opinion about either.
 *
 * Name matching (matching.ts), scan resolution (artwork.ts) and the Cardmarket
 * link (cardmarket.ts) live beside this rather than in it: each is a concern
 * buildCollection() and getCardDetail() below use, not one the other two need
 * to know about. This file is what assembles their answers into a collection.
 */

import { localise, mapLimit, measure, numberForms } from "../util";
import { json, pricesFor, setCatalogue, type SetCatalogue } from "../catalogue/catalogue";
import { CatalogueNotFound, type CardPrices } from "../catalogue/tcgdex-client";
import { speciesOf } from "./pokedex";
import { LOCALE } from "../config";
import { limitlessScan, tcgdexScan } from "../catalogue/artwork";
import { sameCard } from "../catalogue/matching";
import { ptcgScan } from "../catalogue/ptcg";
import type { UsdPrice } from "../catalogue/tcgdex-client";
import {
  cataloguesFor,
  languageCard,
  languageSet,
  setIdOf,
  type LanguageCard,
} from "../catalogue/tcgdex-language";
import type { BrowseLanguage } from "../catalogue/tcgdex-browse";
import {
  type CollectionRow,
  type Finish,
  type FoilPattern,
  type Edition,
  type Language,
  rarityOrNull,
} from "./collection-row";

export { sameCard } from "../catalogue/matching";
export { highScan } from "../catalogue/artwork";

/**
 * One printing of a card: a rarity, and whether that printing is in the binder
 * or on the wishlist. The same card is often held twice, normally and as a
 * reverse holo, and those are two of these rather than two cards.
 *
 * `id` is the row it came from (lib/core/collection/collection-row.ts's CollectionRow.id)
 * — a Postgres row id or a Notion page id, both real and stable once a row is
 * written; null only in the moment before that (a draft has none yet). It is
 * what makes a variant editable and deletable on its own: PATCH/DELETE
 * /v1/cards/[id] act on exactly this id, not on the card's derived `key`,
 * which several variants can share.
 *
 * The six inventory fields below it are per-row for the same reason acquired_at
 * always was: two printings of the same card can be different copies, bought
 * at different times for different prices in different condition. See
 * git history.
 */
export type Variant = {
  id: string | null;
  /** "Non-holo", "Reversed Holo", "Illustration Rare". */
  rarity: string | null;
  /** Notion's Collection checkbox: false means it is wanted, not held. */
  owned: boolean;
  /**
   * Which printing this copy is, or null where nobody has said.
   *
   * The field that makes `priceHolo` on the card usable: Cardmarket prices the
   * foil separately, but only the copy knows whether it is one. Null is priced
   * as normal — see the 20260816200000 migration for why that is not the same
   * as being told it is normal.
   */
  finish: Finish | null;
  /**
   * What that foil looks like, where anything told us: cosmos, cracked ice,
   * starlight, confetti, vertical line. Null is "not recorded" — which is every
   * row that came from Notion and every card added by hand.
   *
   * Beside `finish` rather than inside it, because the two answer different
   * questions: finish decides which price this copy reads, and no catalogue
   * prices a cosmos holo apart from a plain one. See FOIL_PATTERNS.
   */
  foilPattern: FoilPattern | null;
  /**
   * Which print run this copy is from, where somebody said. Null is "not recorded", which is
   * every row until 2026-09-12. Beside `finish` for the same reason the pattern is: an edition
   * is when the card was printed, not which price series it reads. See EDITIONS.
   */
  edition: Edition | null;
  /**
   * How many of this printing. Null on a public payload rather than absent —
   * see forPublic(), which nulls it because how many of a card somebody has is
   * theirs to know. Every path that builds a Variant from a row sets a number.
   */
  quantity: number | null;
  condition: string | null;
  grade: string | null;
  /** Two-letter code, or null for not recorded (read as English). */
  language: Language | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  /** This copy is the one its Pokémon's Pokédex slot shows. See CollectionRow.dexFace. */
  dexFace: boolean;
  /** ISO date, when this printing joined the collection. See CollectionRow.acquiredAt. */
  acquiredAt: string | null;
  /** Kept out of the "latest pull" on the portfolio site. See CollectionRow.excluded. */
  excluded: boolean;
  /** The folder this copy is filed in (`/v1/folders`), or null. Nulled on a public payload. */
  collectionId: string | null;
};

/**
 * What a card costs, from Cardmarket via TCGdex, in euros.
 *
 * This used to be Cardmarket's `low` under the label "From", on the reasoning
 * that the lowest listing is what you would actually pay. Measured, it is not a
 * price at all. It is the lowest listing at any condition in any language, and
 * over 269 sampled cards the median `low` came to 16% of the same card's trend.
 * Worse, 421 of the 1,211 priced cards in this collection sat under €0.10 and
 * together made up 0.1% of the total: their cheapest listing is a bulk lot, not
 * a card. A third of the binder was valued at a rounding error.
 *
 * So `low` is kept for what it honestly is, a floor, and `market` is what a
 * single copy actually changes hands for. `nm` is the estimate of what an
 * English Near Mint copy is listed at, which is the number a collector means
 * when they ask what a card costs, and which no free feed publishes.
 */
/**
 * The price maths lives in lib/price-basis.mjs, re-exported here so every caller
 * keeps importing it from the same place it always did.
 *
 * It moved out because scripts/snapshot-collection-value.mjs has to put the same
 * number on a card as this file does, and Node 20 cannot import a .ts file. The
 * calibration comments moved with it; that file is where they are now.
 */
import { priceOf, copyPriceOf } from "../price-basis.mjs";
export { priceOf, holoPriceOf, shownPrice } from "../price-basis.mjs";
export type { Price } from "../price-basis.mjs";
import type { Price } from "../price-basis.mjs";

const num = (v: unknown) => (typeof v === "number" ? v : null);

export type OwnedCard = {
  /** Set, number and name: unique within the collection, and stable. */
  key: string;
  name: string;
  /** As Notion writes it, usually zero-padded ("088"). */
  number: string;
  /** The Pokémon's type, when the row has one: Fire, Water, Psychic. */
  type: string | null;
  /** The era it belongs to, as recorded: "Base", "Scarlet & Violet". */
  gen: string | null;
  image: string | null;
  /**
   * The same scan at TCGdex' larger size, for when the grid is drawing cards big
   * enough that the small one is being stretched. Null where the picture came
   * from one of the fallback catalogues, which publish a single file.
   */
  imageHigh: string | null;
  /**
   * How big that scan is, where it is one of ours.
   *
   * So the grid can reserve the space before the file arrives. Null for a scan
   * still coming from TCGdex or Limitless, which has not been measured, and the
   * stylesheet's own ratio takes over. See measure() in ./util.
   */
  imageSize: ImageSize;
  /**
   * Which Pokémon this card shows, by National Dex number, or null for the
   * trainers and the energy.
   *
   * Worked out here rather than in the browser. speciesOf() is a scan down a
   * thousand species names looking for the longest one inside the card's name,
   * and /cards used to run it per card while rendering: two thousand cards
   * against a thousand names is two million substring checks in one hydration
   * commit, on a page that already hydrates two thousand grid items. The answer
   * is the same for everyone and never changes, so the server can hold it.
   */
  speciesId: number | null;
  /** The printed name of a card off another shelf, or null; see CardFacts.localName. */
  localName?: string | null;
  /** Every printing held or wanted, in the order Notion returned them. */
  variants: Variant[];
  /** Whether any printing of it is actually in the binder. */
  owned: boolean;
  /** Null when TCGdex has no match for it, or no price for the match. */
  price: Price | null;
  /**
   * The same card's foil printing, where Cardmarket prices one separately.
   *
   * A second price on one card rather than a second card, because that is how
   * Cardmarket files it: one idProduct, two sets of figures. Null for the 865
   * of this collection's 1,526 products that have no foil listing at all — and
   * null rather than zero, which is what the feeds actually publish and what
   * would otherwise value a reverse holo at nothing.
   *
   * Which of the two a copy is worth is a question about the copy, so it is
   * answered per variant. See variantPrice() below.
   */
  priceHolo: Price | null;
  /**
   * The stamped first run's price, where anything prices that run apart; null otherwise.
   *
   * A third price on one card for the same reason there is a second: which of them a copy is
   * worth is a question about the copy, and it is answered in one place, copyPriceOf() in
   * price-basis.mjs.
   */
  priceFirstEd?: Price | null;
  /** The Shadowless run's price, where Cardmarket prices that run apart. See CardFacts.priceShadowless. */
  priceShadowless?: Price | null;
  /**
   * TCGdex's id for the printing this row matched ("sv03-125"), or null when
   * nothing matched. It is the only stable, URL-safe handle a card has, because `key`
   * carries spaces, ampersands and the same dash it is split on, so it is what
   * the detail route is addressed by.
   */
  tcgId: string | null;
};

/** `null` where the picture is not one of ours and so has never been measured. */
export type ImageSize = { width: number; height: number } | null;

export type CardSet = {
  /**
   * The set's name: the official one, where a catalogue knows the set, and the
   * one the owner filed the cards under where none does. What everything
   * addresses it by: the selection in the rail, the filters, the facets.
   *
   * Until 2026-09-11 this was the filing name, kept as typed because changing it
   * changed what a card was. Bart's call: the official name is the truth, and a
   * filing name is a personal decision, not a fact about the card. Rows are
   * still grouped and resolved by what they were filed under (that is how the
   * catalogue is found); the sets are then folded by title (mergeSetsByTitle),
   * so "SV Black Star Promos" and "SVP Black Star Promos" are one set, named
   * the second. The card keys keep the filing name, so no card changes id.
   * A set from another language's catalogue keeps its filing name: its title
   * is the Japanese (Korean, Chinese) one, and the app is English throughout.
   */
  name: string;
  /**
   * Which catalogue the cards in it came from, or null for the English one.
   *
   * The one thing `name` cannot say. A collector who holds Black Bolt in both
   * English and Japanese has two sets here, both called Black Bolt, and this is
   * what tells them apart — a Japanese set has no English name of the
   * catalogue's own, so its `title` is either the Japanese one or the same
   * string again.
   */
  language: BrowseLanguage | null;
  /**
   * The same set, as the catalogues name it, for anywhere it is read rather
   * than matched.
   *
   * These differ more often than they look like they should. "Set 1 Unlimited"
   * is a print run filed as a set; the set is Base Set. A collection kept by
   * hand for years accumulates that sort of thing, and every one of them is
   * correct as a personal filing decision and wrong as a fact about the card.
   *
   * Falling back to `name` is the honest default: a set the catalogues do not
   * know has no official name to prefer, and the owner's is the only one there
   * is. This also stops being one person's problem the moment there are
   * accounts — everybody arrives with their own names for things.
   */
  title: string;
  /**
   * The code printed on the card, in the set symbol's corner: MEW for 151, SFA for Shrouded
   * Fable, DEX for Dark Explorers. Two or three letters, and the thing a collector reads off a
   * card when they want to know which set it is — a full set name under a tile is a line of
   * text you have to parse where three letters are recognised.
   *
   * Already read for the Limitless link guess (SetCatalogue.code); this only carries it out.
   * Null for a set the catalogue names but does not code — of 69 sets in a real collection,
   * exactly one, the Sword & Shield promos.
   */
  abbreviation: string | null;
  logo: string | null;
  /** The logo's size, for the same reason a card's scan carries one. */
  logoSize: ImageSize;
  /** ISO date, when TCGdex knows the set. Drives the order of the sections. */
  releaseDate: string | null;
  /** How many cards the set has in total, for the "12 of 191" line. */
  total: number | null;
  cards: OwnedCard[];
};

/**
 * The same collection with every price taken out.
 *
 * This is what makes the public link honest rather than decorative. Hiding a
 * price in the interface leaves it in the props React ships to the browser, in
 * the HTML of a server-rendered page, and in view for anyone who opens the
 * developer tools. Removing it here means the number never leaves the server:
 * /user/<name> renders from this, and there is nothing to find.
 *
 * `price` is already nullable, because plenty of cards have no Cardmarket
 * entry, so nothing downstream needs a new branch. Every place that shows money
 * is already written as `card.price && …` for that reason, and all of them go
 * quiet on their own.
 *
 * Only `price` needs clearing: the raw Cardmarket figures live on `CardDetail`,
 * which the public page does not build. If a `market` field ever moves onto
 * `OwnedCard`, it has to be cleared here too.
 *
 * A new array rather than a mutation: `getCards()` hands out a memoised object
 * that the owner's page is also holding, and editing it in place would empty
 * the prices out of /cards for as long as the process lived.
 */
/**
 * The card before and after this one, in the collection's own order.
 *
 * Sets newest first and numbered within them, which is the order getCards()
 * already returns and the order the page draws when it is grouped by set. It is
 * deliberately not the order on screen: the filters and the grouping are client
 * state, and a card page reached by its URL has no idea what was ticked when
 * somebody opened it. Following the collection means the arrows answer the same
 * way whether you got here from the grid, from a link, or from a refresh.
 *
 * Cards with no tcgId are skipped: they have no page to move to.
 */
export function cardNeighbours(
  sets: CardSet[],
  tcgId: string,
): { prev: string | null; next: string | null } {
  const ids: string[] = [];
  for (const set of sets) for (const c of set.cards) if (c.tcgId) ids.push(c.tcgId);
  const i = ids.indexOf(tcgId);
  if (i === -1) return { prev: null, next: null };
  return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}

/**
 * The collection as the grid needs it, without what the grid can work out.
 *
 * Today that is `imageHigh` alone. It sits beside stripPrices rather than
 * inside it because they answer different questions — one is about what a
 * visitor may see, the other about what is worth sending — and folding them
 * together would mean the owner's page could not have the second without the
 * first.
 */
/**
 * What one copy of this printing is worth.
 *
 * Per variant rather than per card, which is the point: a card held normally
 * and again as a reverse holo is one OwnedCard whose two copies are worth
 * different amounts, and valuing both at the card's price was the approximation
 * this replaces.
 *
 * ── Only the reverse holo takes the foil price, and that is measured ───────
 *
 * The obvious rule — "any foil printing uses the `-holo` fields" — is wrong,
 * and applying it dropped this collection's valuation by €2,488 before the
 * number was checked. Cardmarket's `-holo` fields mean "the foil version of a
 * card that also has a non-foil version". Against this collection's products on
 * 16 August 2026:
 *
 *   cards that also have a normal printing   trend-holo / trend = 1.90x  (601)
 *   cards that exist only as a holo          trend-holo / trend = 0.47x  ( 69)
 *
 * For a card that has no non-foil version — an Illustration Rare, a V, most of
 * what a modern set calls a hit — the *plain* fields already describe the holo,
 * because there is nothing else to describe. Whatever `-holo` holds there is a
 * thinner, different market, and preferring it halves the card.
 *
 * So: `reverse-holo` (and the Poké Ball and Master Ball reverses) reads the foil
 * fields, `holo` does not. A holo-only card
 * is priced by the plain fields, which is what they are. The imperfect case is
 * a card printed as both holo and reverse holo with no plain version at all —
 * five in a 210-card sample — where the holo copy takes the plain price. That
 * is the same answer it got before this feature existed, so nothing regresses.
 *
 * Null-safe: a reverse holo of a card Cardmarket does not distinguish (865 of
 * 1,526 products publish no foil price at all) falls back to the plain price,
 * which is the honest answer rather than a missing one.
 */
export function variantPrice(card: OwnedCard, variant: Variant): Price | null {
  return copyPriceOf(variant, card);
}

/**
 * Generic over the set shape, because it does not touch a variant.
 *
 * It only nulls `imageHigh`, so it is correct for both the owner's sets and the
 * narrowed public ones — and staying generic is what lets `forGrid(forPublic(…))`
 * keep the public type all the way to the caller instead of widening it back to
 * `CardSet[]` and losing the guarantee at the last step.
 */
export function forGrid<T extends { cards: { imageHigh: string | null }[] }>(sets: T[]): T[] {
  return sets.map((set) => ({
    ...set,
    cards: set.cards.map((card) => ({ ...card, imageHigh: null })),
  }));
}

/**
 * Everything a stranger may see of somebody's collection, and nothing else.
 *
 * This was stripPrices(), and it did half the job. It nulled `card.price`,
 * which is what /user/<name> is about — the page shows the cards without saying
 * what they are worth — and left `card.variants` whole. Variants carry the
 * per-printing inventory fields, so a public profile was publishing what its
 * owner paid for every card, in what condition, graded how, with their private
 * notes attached, and how many of each they hold. Both on the API and, because
 * page.tsx hands the same objects to a client component, inside the HTML of the
 * profile page itself.
 *
 * Nothing wanted them. Traced through every component the public variant
 * reaches, exactly two variant fields are read: `rarity`, for the tags under a
 * scan and the rarity filter, and `owned`, which is what draws a wishlist tag
 * as an outline rather than a fill. The rest is nulled here.
 *
 * `id` goes too. It is the row's own id, the handle PATCH/DELETE
 * /v1/cards/[id] act on, and while the policies would refuse a stranger there
 * is no reason to hand out a list of the identifiers to try.
 *
 * `isFavorite` and `excluded` are set false rather than nulled: they are
 * booleans with a neutral value, and false is "no opinion recorded" for both.
 * The distinction is not worth a nullable type.
 *
 * Renamed rather than extended in place, because "strip prices" had become a
 * name that described a third of what the function needed to do — and the gap
 * between the name and the job is how the variants got missed for as long as
 * they did. It still sits beside forGrid() rather than inside it, for the
 * reason forGrid's own comment gives: one asks what a visitor may see, the
 * other what is worth sending, and the owner's page wants the second without
 * the first.
 *
 * latestPull() reads `owned`, `excluded` and `acquiredAt` to pick a card, so it
 * must run on the raw sets, before this. It does: the latest-pull route builds
 * its own curated shape straight from getCards().
 */
export function forPublic(sets: CardSet[]): CardSet[] {
  return sets.map((set) => ({
    ...set,
    cards: set.cards.map((card) => ({
      ...card,
      price: null,
      priceHolo: null,
      priceFirstEd: null,
      priceShadowless: null,
      // Eleven keys written as null rather than omitted, and that is 472.3 kB
      // of the 1,050 kB RSC flight payload on a 1,635-card profile — 45% of it,
      // measured. Omitting them instead is the obvious win and was attempted;
      // it is not as simple as it looks, and the reason is worth keeping:
      // CardsView reads `finish` after all, transitively, through
      // shownPrice() -> variantPrice(), which branches on
      // `variant.finish === "reverse-holo"`. Narrowing the public variant to two
      // fields therefore breaks nine call sites in a 1,767-line file that is
      // already queued for its own refactor. Do it there, with variantPrice()
      // taking an optional finish, not here.
      variants: card.variants.map((v) => ({
        rarity: v.rarity,
        owned: v.owned,
        id: null,
        // Not published. It is a fact about somebody's copy rather than about
        // the card, it is the key to a price nobody public is shown, and the
        // allow-list here is meant to be argued past rather than added to by
        // habit.
        finish: null,
        // The same argument as finish, one line up: what somebody's own copy
        // looks like is theirs, and the public page shows the cards rather
        // than the collection.
        foilPattern: null,
        // The same argument again: which run somebody's own copy is from is theirs.
        edition: null,
        quantity: null,
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
      })),
    })),
  }));
}

/** The single card most recently acquired, for a portfolio's "latest pull". */
export type LatestPull = {
  name: string;
  number: string;
  image: string | null;
  imageHigh: string | null;
  rarity: string | null;
  speciesId: number | null;
  tcgId: string | null;
  setName: string;
  setTitle: string;
  acquiredAt: string;
};

/**
 * The newest printing in the collection that is owned, not excluded and dated,
 * or null when there is none — an empty collection, or one where every printing
 * fails one of those three gates.
 *
 * All three matter, and `owned` is the one that is easy to forget: the store
 * holds wishlist rows alongside the binder, and a wanted card is not a pull.
 * Left out, this endpoint announced a card that had never been bought — and
 * because a wishlist row is typically a just-announced promo, one no catalogue
 * had a scan for either, so it arrived with `image: null` as well.
 *
 * A deliberately curated shape rather than the raw `OwnedCard`/`Variant`: this
 * is what a public, cross-origin endpoint hands back, and price, purchase
 * price, condition, grade, notes and quantity have no business leaving the
 * server for that. Same reasoning as stripPrices()/forGrid() above, just for a
 * different audience.
 */
export function latestPull(sets: CardSet[]): LatestPull | null {
  let best: { set: CardSet; card: OwnedCard; variant: Variant & { acquiredAt: string } } | null =
    null;
  for (const set of sets) {
    for (const card of set.cards) {
      for (const variant of card.variants) {
        if (!variant.owned || variant.excluded || !variant.acquiredAt) continue;
        if (!best || variant.acquiredAt > best.variant.acquiredAt) {
          best = { set, card, variant: { ...variant, acquiredAt: variant.acquiredAt } };
        }
      }
    }
  }
  if (!best) return null;
  const { set, card, variant } = best;
  return {
    name: card.name,
    number: card.number,
    image: card.image,
    imageHigh: card.imageHigh,
    rarity: variant.rarity,
    speciesId: card.speciesId,
    tcgId: card.tcgId,
    setName: set.name,
    setTitle: set.title,
    acquiredAt: variant.acquiredAt,
  };
}

/**
 * Rows in, a collection out. The whole of what this module is for.
 *
 * It takes the rows rather than fetching them, and that is the seam: this
 * function is the same work whether they came from Notion, from Postgres or
 * from a CSV somebody pasted in. It reads no environment and holds no cache —
 * lib/core/collection/collection.ts does both, because caching a collection is a question
 * about whose it is, and nothing here knows.
 */
export type BuildOptions = {
  /**
   * Whether to resolve what each card is worth. On by default, because every
   * screen that draws a collection shows prices.
   *
   * Off is for a caller that already has prices from somewhere cheaper, and
   * there is exactly one: the weekly snapshot, which downloads Cardmarket's
   * whole price guide in a single request and needs this function only for the
   * matching. With CATALOGUE_SET_PRICING_MAX at 0 — the default — pricing here
   * means one TCGdex request per matched card, so a batch job that priced this
   * way would make sixteen hundred requests to arrive at numbers it already had
   * in one file.
   *
   * It only skips the fetching. Whatever the set catalogue happened to
   * pre-price is still ignored too, so `price` is null on every card rather
   * than null on most of them — a caller that asked not to be given prices
   * should not have to wonder which ones it got anyway.
   */
  prices?: boolean;
  /**
   * Where a price comes from, given the TCGdex ids that need one. The default
   * asks TCGdex card by card; collection.ts hands in the Cardmarket guide first
   * and TCGdex only for what the guide does not know. The nightly snapshot
   * passes `prices: false` and never reaches this.
   */
  priceSource?: (ids: string[]) => Promise<Map<string, CardPrices>>;
  /**
   * The catalogue is unreachable, so build from the rows alone: every set
   * under the name its owner typed, every card without a scan, a catalogue id
   * or a price, and no fallback lookups either. An answer for the duration of
   * a TCGdex outage, and one nothing must cache; getCollection() is the caller
   * and keeps it out of the hour-long entry.
   */
  offline?: boolean;
  /**
   * Where each set's catalogue facts come from. Left out, resolveSetFacts()
   * runs here with the options above; collection.ts hands in a day-long cache
   * in front of it, keyed by set and by which printings are asked about, so a
   * write to a row costs a read of the rows and not the matching again.
   */
  factsSource?: FactsSource;
  /**
   * Every set's facts in one answer, asked once, before the sets are walked.
   *
   * `factsSource` is asked per set and collection.ts puts a day-long cache entry per set in
   * front of it. That is one Data Cache read per set, and on production those are ~16 ms each
   * over the network: fifty-two sets is a hundred and two reads and a megabyte pulled before
   * anything is drawn, measured at 5 to 9 seconds on 2026-09-12 where the same walk against a
   * local cache is 0.16. So the caller may hand in a bundle instead, which it can keep in one
   * entry. Left out, nothing changes: the per-set source above still answers.
   */
  factsBundle?: FactsBundle;
};

/** What the catalogue knows about a set it cannot be asked about: nothing. */
const OFFLINE_CATALOGUE: SetCatalogue = {
  byNumber: {},
  assetBase: null,
  officialName: null,
  code: null,
  setHasScans: false,
  logo: null,
  releaseDate: null,
  total: null,
  prices: {},
};

/**
 * What a row says about which card it is. With the set name, all the catalogue
 * is asked.
 *
 * `card` is the second address, and it is only ever set for the four languages
 * that have a catalogue of their own: a Japanese set has no English name, so a
 * number within a set found by English name finds nothing at all. See
 * catalogueAddress() below and tcgdex-language.ts.
 */
export type CardIdentity = {
  number: string;
  name: string;
  card?: CatalogueAddress;
};

/**
 * One identity as the facts map keys it. A NUL cannot come out of a form, so it
 * cannot collide.
 *
 * An English identity keys exactly as it always did — two segments, the same
 * bytes — which is what keeps the question asked about the 1,955 rows that
 * exist today the question that was asked yesterday. A card with a catalogue of
 * its own adds two more segments, so a Japanese card and an English one at the
 * same number of a set with the same name are two questions rather than one.
 */
export const identityKey = ({ number, name, card }: CardIdentity): string =>
  card
    ? `${number}\u0000${name}\u0000${card.language}\u0000${card.tcgId}`
    : `${number}\u0000${name}`;

/** Which catalogue a card lives in, where it is not the English one, and its id there. */
export type CatalogueAddress = { language: Language; tcgId: string };

/**
 * The address of a row's card, or null for the English catalogue.
 *
 * Both halves are needed and neither is enough on its own. The language cannot
 * find the card — the Japanese catalogue is not searchable by an English set
 * name, and the English name the shelf shows a Japanese set under is ours
 * rather than the catalogue's. The id does not say which catalogue, because the
 * Chinese and Korean ones print the Japanese sets under the same ids. A row
 * that carries only one of the two resolves the English way, which is what
 * every row in this collection does today.
 */
export function catalogueAddress(
  row: Pick<CollectionRow, "language" | "tcgId">,
): CatalogueAddress | null {
  if (!row.language || !row.tcgId) return null;
  return cataloguesFor(row.language).length ? { language: row.language, tcgId: row.tcgId } : null;
}

/** A row as the facts map asks about it: the one place the two addresses are put together. */
export const identityOf = (row: CollectionRow): CardIdentity => {
  const card = catalogueAddress(row);
  return card
    ? { number: row.number, name: row.name, card }
    : { number: row.number, name: row.name };
};

/**
 * The identities of a set's rows, each once, in one order. What the facts of a
 * set are a function of, and so what a cache may key them on: two rows of the
 * same printing, or the same rows in another order, must ask the same question.
 */
export function setIdentities(rows: CollectionRow[]): CardIdentity[] {
  const seen = new Map<string, CardIdentity>();
  for (const row of rows) {
    const identity = identityOf(row);
    seen.set(identityKey(identity), identity);
  }
  return [...seen.keys()].sort().map((key) => seen.get(key)!);
}

/**
 * What the catalogues say about one printing: facts about the card, none about
 * the copy. Kept apart from the row's own fields so a star, a quantity or a
 * note can change without any of this being asked again.
 */
export type CardFacts = {
  image: string | null;
  imageHigh: string | null;
  /** TCGdex's id for this card, or null where nothing matched. */
  tcgId: string | null;
  /** TCGdex's name where the row matched a card; the Dex files under it. See speciesId. */
  matchedName: string | null;
  /**
   * What the card prints, where that is not what the row says: a Japanese, Korean or Chinese
   * card's own name, from its catalogue, for a sheet to show in brackets after the English one.
   * Null on every English card — the row's name is the printed one there. Optional in the
   * type, not the answer: every fixture that builds a card by hand predates it.
   */
  localName?: string | null;
  /** The printed number, for the second market's lookup outside these facts (collection.ts). */
  number: string;
  /** Cardmarket's alone; TCGplayer is blended in by the caller, from a cache of its own. */
  price: Price | null;
  /** TCGplayer's dollars as TCGdex relays them, where the card was fetched there: the blend's fallback. */
  usd: UsdPrice | null;
  /** The stamped first run's dollars, where TCGplayer prices that run apart. See CardPrices.usdFirstEd. */
  usdFirstEd?: UsdPrice | null;
  priceHolo: Price | null;
  /**
   * What the stamped first run trades at, in euros, where anything prices that run apart.
   *
   * TCGplayer's figure converted and nothing else: Cardmarket publishes one price per card id
   * and it is the ordinary run's, so there is nothing here to average it with. Null on every
   * card nobody prices a stamped run for, which is most of them, and a 1st Edition copy of one
   * of those falls back to the ordinary price. See copyPriceOf() in price-basis.mjs.
   */
  priceFirstEd?: Price | null;
  /**
   * What the Shadowless run trades at, in euros, where Cardmarket files that run as a product of
   * its own. Base Set is the one set it does, every card of it; null everywhere else, and a
   * Shadowless copy of a card nobody prices apart falls back to the ordinary price.
   */
  priceShadowless?: Price | null;
  /**
   * TCGdex's word for how rare this printing is, from a catalogue that is not
   * the English one — and null on every English card, always.
   *
   * The English path never fills this and must not start: rarity has been the
   * row's own column since the catalogue backfill, and a second source for it
   * is the drift .claude/rules/catalogue-and-collection.md is written against.
   * The other catalogues do not publish it on a set's card list at all, so the
   * shelf a Japanese card is added from cannot send one — and the per-card
   * request this path already makes for the price carries it, for free. Null
   * here leaves the row's own rarity standing, which is the same answer an
   * English card gives.
   */
  rarity: string | null;
  /** Which catalogue answered, or null for the English one. Kept so the blend can skip these. */
  catalogue: BrowseLanguage | null;
};

/** A set as the catalogue knows it, and the facts of each printing asked about. */
export type SetFacts = {
  title: string | null;
  /** The code printed on the card; see CardSet.abbreviation. */
  abbreviation: string | null;
  logo: string | null;
  releaseDate: string | null;
  total: number | null;
  /** By identityKey(). Every identity asked for has an entry, matched or not. */
  cards: Record<string, CardFacts>;
};

/** Where a set's facts come from: resolveSetFacts(), or a cache in front of it. */
export type FactsSource = (setName: string, identities: CardIdentity[]) => Promise<SetFacts>;

/** One group of rows as a bundle is asked about it: which set, which catalogue, which printings. */
export type FactsGroup = {
  /** The key the bundle's answer is filed under, and the one buildCollection groups by. */
  key: string;
  setName: string;
  language: BrowseLanguage | null;
  identities: CardIdentity[];
};

/** Every group's facts at once, keyed by `FactsGroup.key`. A plain object: a Map does not survive the Data Cache. */
export type FactsBundle = (groups: FactsGroup[]) => Promise<Record<string, SetFacts>>;

export type ResolveOptions = Pick<BuildOptions, "prices" | "priceSource" | "offline">;

/**
 * One card from a catalogue that is not the English one, as CardFacts.
 *
 * Null where that catalogue has never heard of the id — which is the one case
 * that must not be an error: the row says it is a Japanese copy and carries an
 * English id, or an id that was mistyped, and the honest answer is to let it
 * fall back to the English path below rather than to show nothing.
 */
function factsOfLanguageCard(
  identity: CardIdentity,
  card: LanguageCard,
  prices: boolean,
): CardFacts {
  return {
    // The same two addresses the English path builds, off the base the
    // catalogue hands over: low for the grid, high for the slider past 180px.
    // Or Limitless's pair, where TCGdex has recorded the card and not photographed it —
    // languageCard() found that out, once per card, and says so with `scan`.
    image: card.scan?.low ?? (card.image ? localise(`${card.image}/low.webp`) : null),
    imageHigh: card.scan?.high ?? (card.image ? localise(`${card.image}/high.webp`) : null),
    tcgId: card.id,
    matchedName: card.name || null,
    localName: card.name || null,
    number: card.number || identity.number,
    // Cardmarket's own figure for this exact printing, through the same
    // priceOf() the English path uses, so "no price" is a null on both — the
    // distinction the whole value chart is built on. Japanese cards mostly
    // carry a Cardmarket product; Chinese ones almost never do, and those read
    // as unpriced rather than as worth nothing.
    price: prices ? card.price : null,
    priceHolo: prices ? card.holo : null,
    // No second market: pokemontcg.io indexes the English game only, so there
    // is nothing to blend and nothing to look one up by. The stamped run comes from that
    // market alone, so it is null here too: no Japanese set had a 1st Edition run anyway.
    usd: null,
    usdFirstEd: null,
    priceFirstEd: null,
    // No Japanese, Korean or Chinese set had a run of its own, and Cardmarket files none apart.
    priceShadowless: null,
    rarity: card.rarity,
    catalogue: card.catalogue,
  };
}

/**
 * The catalogue half of a set: which card each printing is, its scan, and what
 * it is worth. A pure function of the set name and the identities, and the
 * whole of what a rebuild used to pay for — one to three lookups per card the
 * set catalogue does not place, and one TCGdex request per card the price
 * guide does not know. Twenty seconds for this collection, paid again on every
 * write until the caller put a day-long cache in front of it (collection.ts).
 *
 * ── Two paths, and the first one is untouched ──────────────────────────────
 *
 * Everything below the language block is what it always was: the set catalogue
 * found by English name, every printing matched by number within it, the
 * Limitless and pokemontcg.io fallbacks, one price request per card the guide
 * does not know. A set with no card of its own catalogue never enters the new
 * code and never pays a request for it.
 *
 * The second path is for a row that names a catalogue of its own — a Japanese,
 * Korean or Chinese card, with the id it has there. It does not match anything:
 * the id *is* the match, so there is no set to resolve by name, no number to
 * fold, no name to check, and none of the three artwork fallbacks (all English).
 * One request per card answers the picture, the rarity and the price at once.
 *
 * A row whose id that catalogue does not have joins the English identities
 * afterwards and is resolved the old way. That is the whole of what happens
 * when somebody marks an English row as a Japanese copy: it costs one 404 and
 * then behaves exactly as it did before.
 */
export async function resolveSetFacts(
  setName: string,
  identities: CardIdentity[],
  { prices = true, priceSource = pricesFor, offline = false }: ResolveOptions = {},
): Promise<SetFacts> {
  // Offline is the rows and nothing else, so a row with a catalogue of its own
  // takes the same empty answer every other row takes rather than a request.
  const addressed = offline ? [] : identities.filter((i) => i.card);
  const foreign: Record<string, CardFacts> = {};
  const unfound: CardIdentity[] = [];
  let answered: LanguageCard | null = null;
  if (addressed.length) {
    // Eight at a time, as the English map below runs: one request each, and
    // json() has cached every one of them for a day for everybody.
    const found = await mapLimit(addressed, 8, async (identity) => ({
      identity,
      card: await languageCard(cataloguesFor(identity.card!.language), identity.card!.tcgId),
    }));
    for (const { identity, card } of found) {
      if (!card) unfound.push(identity);
      else {
        foreign[identityKey(identity)] = factsOfLanguageCard(identity, card, prices);
        answered ??= card;
      }
    }
  }
  const english = offline ? identities : [...identities.filter((i) => !i.card), ...unfound];

  // Not asked for at all where nothing needs it: a set held only in Japanese
  // would otherwise resolve an English set by a name that is a translation of
  // ours, and wear its logo, its date and its card count.
  const cat = offline || english.length === 0 ? OFFLINE_CATALOGUE : await setCatalogue(setName);
  const { assetBase, code, setHasScans } = cat;

  // The fallback is one to three HEAD requests per card, so on a set TCGdex
  // does not know at all it would fire hundreds and find nothing. A cap keeps
  // it useful for the handful of cards from a set too new to be indexed,
  // which is the only case it was ever for.
  //
  // None at all offline: the fallbacks are the other two catalogues, and an
  // outage answer should cost the rows and nothing over the network.
  let fallbacks = offline ? 0 : 40;

  // Eight at a time, as the rows were walked before this was a function of
  // identities. The set catalogue is one cached read; the fallbacks are what
  // the limit is for.
  const resolved = await mapLimit(english, 8, async (identity) => {
    const { name, number } = identity;
    const match = numberForms(number)
      .map((form) => cat.byNumber[form.toLowerCase()])
      .find(Boolean);
    // A number that resolves to a different Pokémon means the numbering does
    // not line up, and a wrong scan is worse than a missing one.
    const matched = match?.name && !sameCard(match.name, name) ? undefined : match;

    // low, not high. TCGdex publishes both; high is around 600px wide and
    // 77kB, low is 245px and 22kB. The grid draws these at 104 to 132px and
    // the list view at 44px, and there is no detail view anywhere on the
    // route, so every one of those 55 extra kilobytes was decoded and thrown
    // away. It is the page's LCP element, measured at seven seconds on a
    // throttled phone.
    //
    // Through localise(), which is the identity function here (see ./util). This was the
    // one place that skipped it: scripts/localise-images.mjs had already
    // pulled 1,449 of these scans into public/artwork/cards, the manifest
    // mapped every one of them, and nothing read it. Every card on the page
    // was still being fetched from TCGdex' CDN, which is why the sets that
    // happen to sit on a cold edge there load visibly slower than the rest.
    //
    // The size the grid draws at is a slider now, and past about 180px the
    // 245px file is being stretched. So the big one is resolved too and
    // handed over beside the small one, for the browser to ask for only if
    // the reader ever pushes the grid up that far. Only from TCGdex, whose
    // URLs carry the size as the last segment: the two fallbacks below
    // publish one file each and there is no larger one to name.
    // A path we built ourselves is checked before it is used: TCGdex lists a
    // gallery's cards without an `image` and the files are there under the
    // parent set, but it also lists cards it has no scan of at all, and those
    // paths are 404s that looked like artwork and so kept the fallbacks below
    // from ever running.
    const guessed = matched?.localId && assetBase ? `${assetBase}/${matched.localId}` : null;
    const tcgBase = !setHasScans
      ? null
      : (matched?.image ?? (guessed ? await tcgdexScan(guessed) : null));
    let image = tcgBase ? localise(`${tcgBase}/low.webp`) : null;
    let imageHigh = tcgBase ? localise(`${tcgBase}/high.webp`) : null;
    if (!image && number && fallbacks > 0) {
      fallbacks--;
      // Limitless first, where the set has a code there. Not every set does,
      // and the second catalogue does not need one: it is asked by set name.
      //
      // Never for a gallery number, though: Limitless renumbers those into the
      // parent set's run, so TG04 would be asked for under the parent's 04 and
      // answer with a different card. That is the offset lib/core/catalogue/catalogue.ts
      // declines to guess, and it is why this line keeps the letter check the
      // one below no longer needs.
      if (code && !/^[A-Za-z]/.test(number)) image = await limitlessScan(code, number);
      // The last resort, for the cards neither TCGdex nor Limitless has. This
      // is the one that finds the €440 Pikachu with the grey felt hat, the
      // most expensive card in the binder and the only one on the dashboard
      // with an empty square where its picture goes.
      image ??= await ptcgScan(setName, number, name);
      // A fallback scan is one file, so there is no larger version of it to
      // offer and the grid keeps drawing the one it has.
      imageHigh = null;
    }

    return {
      key: identityKey(identity),
      number,
      image,
      imageHigh,
      tcgId: matched?.id ?? null,
      matchedName: matched?.name ?? null,
    };
  });

  // One pass over the whole set rather than a request inside the map above:
  // that map already runs eight at a time, and a nested fetch would have made
  // it eight times eight.
  //
  // Whatever the catalogue already priced is free; the rest is asked for
  // here. With pre-pricing off — which is the default — that is every matched
  // card, exactly as before. With it on, this list is usually empty.
  const wanted = [...new Set(resolved.map((r) => r.tcgId).filter(Boolean))] as string[];
  const missing = prices ? wanted.filter((id) => !(id in cat.prices)) : [];
  const fetched = missing.length ? await priceSource(missing) : new Map<string, CardPrices>();
  const priceOfId = (id: string | null) =>
    (prices && id && (fetched.get(id)?.price ?? cat.prices[id])) || null;
  /**
   * The foil price, where the fetch found one.
   *
   * Only from the fetch, never from cat.prices: the set catalogue pre-prices
   * a whole set into a Record<string, Price> and has no second slot, so a
   * pre-priced card has no foil figure and falls back to the normal one.
   * That is invisible today — pre-pricing ships off (CATALOGUE_SET_PRICING_MAX
   * defaults to 0) — and is the reason this is a lookup rather than a field
   * on that Record: widening the catalogue's shape is a bigger change than
   * the one this is part of, and it would want its own cache version bump.
   */
  const holoOfId = (id: string | null) => (prices && id && fetched.get(id)?.holo) || null;

  const cards: Record<string, CardFacts> = {};
  for (const r of resolved) {
    cards[r.key] = {
      image: r.image,
      imageHigh: r.imageHigh,
      tcgId: r.tcgId,
      matchedName: r.matchedName,
      localName: null,
      number: r.number,
      price: priceOfId(r.tcgId),
      usd: (prices && r.tcgId && fetched.get(r.tcgId)?.usd) || null,
      usdFirstEd: (prices && r.tcgId && fetched.get(r.tcgId)?.usdFirstEd) || null,
      priceHolo: holoOfId(r.tcgId),
      priceShadowless: (prices && r.tcgId && fetched.get(r.tcgId)?.shadowless) || null,
      // Always null on this path. See CardFacts.rarity: the row's own column is
      // the one source for an English card's rarity and is to stay so.
      rarity: null,
      catalogue: null,
    };
  }
  // After the English cards, so an entry keyed the same way cannot be
  // overwritten by one — it cannot be, the keys differ by construction, and
  // this order says which would win if that ever stopped being true.
  Object.assign(cards, foreign);

  // The heading over a set nobody holds an English card of. Its own catalogue
  // is the only one that knows the set at all, and even it publishes no logo
  // for these, so the tile draws the name — as an unpictured English promo does.
  const own = answered && english.length === 0 ? await ownSetFacts(answered) : null;

  return {
    title: own?.name ?? cat.officialName,
    abbreviation: cat.code,
    logo: cat.logo,
    releaseDate: own?.releaseDate ?? cat.releaseDate,
    total: own?.total ?? cat.total,
    cards,
  };
}

/**
 * The set behind a card that came from its own catalogue: one request, for the
 * release date.
 *
 * The card's record already names and counts its set, so this is asked for the
 * date alone — which is what sorts the collection newest set first, and without
 * it every Japanese set would sort last on an empty string. Null on anything
 * short of an answer; the set then reads under the name its owner typed.
 */
async function ownSetFacts(card: LanguageCard) {
  const setId = card.setId ?? setIdOf(card.id);
  const set = setId ? await languageSet(card.catalogue, setId) : null;
  return {
    name: set?.name ?? card.setName,
    releaseDate: set?.releaseDate ?? null,
    total: set?.total ?? null,
  };
}

export async function buildCollection(
  rows: CollectionRow[],
  {
    prices = true,
    priceSource = pricesFor,
    offline = false,
    factsSource,
    factsBundle,
  }: BuildOptions = {},
): Promise<CardSet[]> {
  if (!rows.length) return [];

  // Group first, so each set is only resolved once however many cards came from
  // it. This deliberately ignores any cover art set by hand in the store: in
  // Notion those come back as presigned S3 URLs on a host the CSP does not
  // allow, so across a whole grid they would be a wall of blocked images rather
  // than the one that was picked. TCGdex and Limitless are both allowed (see
  // next.config.ts).
  /**
   * By set name, and by which catalogue the cards in it come from.
   *
   * The second half is new and it is not a refinement. A Japanese set and an
   * English one are routinely filed under the same name — the shelf shows
   * トリプレットビート as "Triplet Beat" and ブラックボルト as "Black Bolt",
   * and both of those are real English sets too — and one group is resolved
   * once, against one catalogue. Grouped by name alone, a binder holding both
   * would ask the English catalogue about the Japanese cards or the other way
   * round, and every card of the losing half would come back with the other
   * one's picture and price.
   *
   * The row's own language, not the catalogue that ends up answering: grouping
   * has to be a fact about the row, decidable without a request.
   */
  const grouped = new Map<
    string,
    { setName: string; language: BrowseLanguage | null; rows: CollectionRow[] }
  >();
  for (const row of rows) {
    // The same two guards as ever: a row with no set cannot be placed and a row
    // with no name cannot be drawn. Every adapter applies them when it makes
    // the row, so this is the floor rather than the check.
    if (!row.setName || !row.name) continue;
    const language = catalogueAddress(row) ? (row.language as BrowseLanguage) : null;
    const key = language ? `${language}\u0000${row.setName}` : row.setName;
    const bucket = grouped.get(key) ?? { setName: row.setName, language, rows: [] };
    bucket.rows.push(row);
    grouped.set(key, bucket);
  }
  if (!grouped.size) return [];

  const perSet: FactsSource =
    factsSource ??
    ((setName, identities) =>
      resolveSetFacts(setName, identities, { prices, priceSource, offline }));

  /*
   * One question where there were fifty-two, when the caller can answer it that way.
   *
   * Asked here rather than per set below so the caller has something it can keep in a single
   * cache entry; the groups are already worked out. A key the bundle did not answer for falls
   * through to the per-set source, which is what makes this safe to hand in: a bundle that is
   * short of a set is slower, never wrong.
   */
  const bundled = factsBundle
    ? await factsBundle(
        [...grouped.entries()].map(([key, g]) => ({
          key,
          setName: g.setName,
          language: g.language,
          identities: setIdentities(g.rows),
        })),
      )
    : null;
  const facts = async (key: string, setName: string, identities: CardIdentity[]) =>
    bundled?.[key] ?? (await perSet(setName, identities));

  // Six at a time. Forty-eight sets going at once was enough for TCGdex to
  // start refusing, and a refusal is a whole section of the page with no
  // artwork; three was the number while every set went there. Now a set's
  // facts are one cached read on every request but the first, and fifty-two
  // reads three at a time is a second of waiting on nothing; six keeps a
  // cold day's fetches well under the refusal and halves the warm wait.
  const out = await mapLimit(
    [...grouped.entries()].map(([key, g]) => ({ key, ...g })),
    6,
    async ({ key: groupKey, setName, language, rows: setRows }) => {
      const set = await facts(groupKey, setName, setIdentities(setRows));

      // One entry per printing first, then folded together below: the facts of
      // the card from the catalogue, the facts of the copy from the row.
      const printings = setRows.map((row) => {
        const { name, number } = row;
        const card = set.cards[identityKey(identityOf(row))];
        const scan = card?.image
          ? { image: card.image, imageHigh: card.imageHigh }
          : { image: row.imageUrl ?? null, imageHigh: row.imageHighUrl ?? null };
        return {
          // Prefixed by the catalogue where there is one, and by nothing at all
          // where there is not — so every key in this collection today is the key
          // it was yesterday. Without the prefix, a Japanese and an English card
          // at the same number of two sets spelled the same are one key in a flat
          // list, which is a duplicate id in whatever draws it.
          key: language
            ? `${language}:${setName}-${number || name}`
            : `${setName}-${number || name}`,
          name,
          number,
          // Joined back into one string, which is what OwnedCard.type has always
          // been and what CardsView, FilterOptions and cards-stats.ts all read.
          // The row carries a list because a multi-select is a list; widening the
          // card to match is a separate change with its own blast radius.
          type: row.types.join(", ") || null,
          gen: row.gen,
          // The catalogue's answer, and the row's memory of the last one where it has none.
          // Which way round that is matters: a catalogue that answers always wins, so a better
          // scan, a corrected match or a card that moved sets is picked up on the next read.
          // The memory is only for the minutes the catalogue is silent - see
          // CollectionRow.imageUrl, and rememberedScans(), which writes it.
          //
          // The pair moves together. A fallback scan is one file and carries no high version,
          // so taking the catalogue's low beside a remembered high would draw two different
          // resolutions of two different pictures as one card.
          image: scan.image,
          imageHigh: scan.imageHigh,
          imageSize: measure(scan.image),
          // TCGdex' name where the row matched one, the row's own where it did
          // not. Which Pokémon a card shows is a fact about the card rather than
          // about how it was typed, and the Dex is the one place a misspelling
          // was silently destructive: "Tyrantirar" is not a species, so the card
          // simply was not filed anywhere and Tyranitar read as uncaught. The
          // scans and the prices survive a typo now (see sameCard); this is the
          // rest of that.
          // With the shelf it came from: a Japanese card is named in Japanese, and the
          // English list cannot place it, so it used to land in no slot at all.
          speciesId: speciesOf(card?.matchedName ?? name, card?.catalogue),
          localName: card?.localName ?? null,
          tcgId: card?.tcgId ?? null,
          price: card?.price ?? null,
          priceHolo: card?.priceHolo ?? null,
          priceFirstEd: card?.priceFirstEd ?? null,
          priceShadowless: card?.priceShadowless ?? null,
          // The catalogue's word where it has one, the row's where it does not.
          // Only a card from its own catalogue ever carries the first — the
          // shelves those are added from publish no rarity, so a row written from
          // one has nothing in this column, and the per-card request the price
          // already costs carries the answer. See CardFacts.rarity.
          //
          // "Promo" is not one it has: that names the set, and letting it through
          // here would put it back over a rarity its owner said by hand.
          rarity: rarityOrNull(card?.rarity) ?? row.rarity,
          owned: row.owned,
          // The row's own id and inventory facts, carried through untouched so
          // the merge below can build one Variant per row. See Variant's own
          // comment for why these travel this far.
          id: row.id,
          finish: row.finish,
          foilPattern: row.foilPattern,
          edition: row.edition,
          quantity: row.quantity,
          condition: row.condition,
          grade: row.grade,
          language: row.language,
          purchasePrice: row.purchasePrice,
          purchaseDate: row.purchaseDate,
          notes: row.notes,
          isFavorite: row.isFavorite,
          dexFace: row.dexFace,
          acquiredAt: row.acquiredAt,
          excluded: row.excluded,
          collectionId: row.collectionId,
        };
      });

      // Holding a card normally and again as a reverse holo is one card with two
      // printings, not two cards. 317 of them in this collection, and shown twice
      // they read as a duplicate rather than as something worth knowing. The
      // rarities become tags under a single scan.
      //
      // Deduped on the row's own id rather than on (rarity, owned): two rows
      // sharing both used to collapse into one Variant, silently dropping the
      // second row's own acquired_at and, now, its own quantity/condition/price/
      // notes — exactly the facts the per-variant inventory fields exist to
      // keep separate. An id is unique per row by construction, so this is
      // strictly more precise, not just differently precise.
      const merged = new Map<string, OwnedCard>();
      for (const p of printings) {
        const existing = merged.get(p.key);
        const variant: Variant = {
          id: p.id,
          rarity: p.rarity,
          owned: p.owned,
          finish: p.finish,
          foilPattern: p.foilPattern,
          edition: p.edition,
          quantity: p.quantity,
          condition: p.condition,
          grade: p.grade,
          language: p.language,
          purchasePrice: p.purchasePrice,
          purchaseDate: p.purchaseDate,
          notes: p.notes,
          isFavorite: p.isFavorite,
          dexFace: p.dexFace,
          acquiredAt: p.acquiredAt,
          excluded: p.excluded,
          collectionId: p.collectionId,
        };
        if (existing) {
          if (variant.id === null || !existing.variants.some((v) => v.id === variant.id))
            existing.variants.push(variant);
          existing.owned ||= p.owned;
          // The first row of a card may be the one with no artwork, and the same
          // goes for the price: a card held twice is one card, and whichever of
          // its rows TCGdex matched is the one that knows what it is worth.
          existing.image ??= p.image;
          existing.price ??= p.price;
          existing.priceHolo ??= p.priceHolo;
          existing.tcgId ??= p.tcgId;
          existing.localName ??= p.localName;
          continue;
        }
        merged.set(p.key, {
          key: p.key,
          name: p.name,
          localName: p.localName ?? null,
          number: p.number,
          type: p.type,
          gen: p.gen,
          image: p.image,
          imageHigh: p.imageHigh,
          imageSize: p.imageSize,
          speciesId: p.speciesId,
          price: p.price,
          priceHolo: p.priceHolo,
          priceFirstEd: p.priceFirstEd,
          priceShadowless: p.priceShadowless,
          tcgId: p.tcgId,
          variants: [variant],
          owned: p.owned,
        });
      }
      const cards = [...merged.values()];

      return {
        name: setName,
        language,
        title: set.title ?? setName,
        abbreviation: set.abbreviation,
        logo: set.logo,
        logoSize: measure(set.logo),
        releaseDate: set.releaseDate,
        total: set.total,
        // Ascending by number, which is the order the cards sit in a binder. The
        // gallery cards are lettered (TG01), so they sort to the front on a
        // numeric parse of 0; comparing the raw string keeps them together at
        // the end where a collector expects them.
        cards: cards.sort((a, b) => {
          const na = parseInt(a.number, 10);
          const nb = parseInt(b.number, 10);
          if (Number.isNaN(na) || Number.isNaN(nb)) return a.number.localeCompare(b.number, LOCALE);
          return na - nb;
        }),
      };
    },
  );

  // Newest set first. A set TCGdex has never heard of has no date to sort on
  // and goes last rather than jumping to the front on an empty string.
  return mergeSetsByTitle(out).sort((a, b) =>
    (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "", LOCALE),
  );
}

/** Ascending by number; the lettered gallery cards (TG01) sort together at the end. */
const byNumber = (a: OwnedCard, b: OwnedCard): number => {
  const na = parseInt(a.number, 10);
  const nb = parseInt(b.number, 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.number.localeCompare(b.number, LOCALE);
  return na - nb;
};

/**
 * One set per official name, named by it.
 *
 * Rows are grouped by the name they were filed under, and a set filed under two
 * names came out as two sets under one title: the SVP promos as "SV Black Star
 * Promos" and "SVP Black Star Promos", the Wizards promos as "Wizard" and
 * "Wizards". The title is the set's name (see CardSet.name), so those fold into
 * one, named the title. A card at one number in both folds into one card with
 * every row's variants, as two rows of one printing do within a set; the first
 * set's facts (logo, date, total) stand, and the other's fill what it lacks.
 * A set from another language's catalogue is left as it is: its title is the
 * Japanese (Korean, Chinese) name, and the app names every set in English —
 * which, for those, is what the owner filed it under.
 */
export function mergeSetsByTitle(sets: CardSet[]): CardSet[] {
  const byTitle = new Map<string, CardSet>();
  const out: CardSet[] = [];
  for (const set of sets) {
    if (set.language !== null) {
      out.push(set);
      continue;
    }
    const found = byTitle.get(set.title);
    if (!found) {
      const named = { ...set, name: set.title, cards: [...set.cards] };
      byTitle.set(set.title, named);
      out.push(named);
      continue;
    }
    found.abbreviation ??= set.abbreviation;
    if (found.logo === null && set.logo !== null) {
      found.logo = set.logo;
      found.logoSize = set.logoSize;
    }
    found.releaseDate ??= set.releaseDate;
    found.total ??= set.total;
    for (const card of set.cards) {
      const same = found.cards.find((c) => (c.number || c.name) === (card.number || card.name));
      if (!same) {
        found.cards.push(card);
        continue;
      }
      for (const v of card.variants) {
        if (v.id === null || !same.variants.some((mine) => mine.id === v.id)) same.variants.push(v);
      }
      same.owned ||= card.owned;
      same.image ??= card.image;
      same.imageHigh ??= card.imageHigh;
      same.price ??= card.price;
      same.priceHolo ??= card.priceHolo;
      same.tcgId ??= card.tcgId;
      same.localName ??= card.localName;
    }
    found.cards.sort(byNumber);
  }
  return out;
}

/** Everything TCGdex knows about one card, for the detail route. */
export type CardDetail = {
  id: string;
  name: string;
  image: string | null;
  rarity: string | null;
  illustrator: string | null;
  hp: number | null;
  types: string[];
  stage: string | null;
  evolveFrom: string | null;
  regulationMark: string | null;
  /**
   * Whether a stamped first run of this card exists, as TCGdex says.
   *
   * The whole point of relaying it is to stop a form asking a question with no answer: a card
   * printed once was never a 1st Edition, and offering the choice there invites somebody to
   * record something that does not exist. Null where the catalogue did not say, and then the
   * form offers the runs rather than none, which is the rule the finishes already follow.
   */
  firstEdition: boolean | null;
  set: { id: string; name: string; logo: string | null; total: number | null } | null;
  /** Cardmarket's product id, which is how a card is addressed on their site. */
  cmId: number | null;
  /**
   * Where to buy it. Null for now, on purpose: the address was built from the card's name and
   * the set's, and the button it fed ("Buy on Cardmarket", in the iOS app) landed on the wrong
   * page or on nothing. Cardmarket publishes its product ids but not the expansion half of a
   * product's address, and its site answers every probe with a bot check, so the right page
   * cannot be guaranteed from here. Null hides the button in every client without a release;
   * cardmarketUrl() and the links map stay for when the address can be made to hold.
   */
  cmUrl: string | null;
  price: Price | null;
  /** The rest of Cardmarket's numbers, for the card's own page. */
  market: { avg: number | null; trend: number | null; avg7: number | null } | null;
};

/**
 * One card, in full, from TCGdex.
 *
 * Separate from getCards() on purpose: the list needs eight fields per card and
 * pays for them once per set, and the detail page needs everything for exactly
 * one card. Fetching the set to render a single card would be the wrong shape.
 *
 * Null only for a card TCGdex does not have, which the route answers 404. An
 * outage is rethrown: it used to be null as well, and both card routes turned
 * a TCGdex that was down into "No such card." — a 404 a CDN would keep for an
 * hour. The route answers that with a 503 nothing caches.
 */
export async function getCardDetail(
  id: string,
  language: BrowseLanguage | null = null,
): Promise<CardDetail | null> {
  let card;
  try {
    // Encoded, not interpolated raw. This id reaches here straight off a URL
    // segment on the unauthenticated public route, and Next has already decoded
    // it — so "..%2F..%2Fsets" arrives as "../../sets" and fetch() normalises it
    // away to a different TCGdex endpoint. The host cannot be changed this way,
    // so it was never SSRF, but each traversal string is another uncacheable
    // outbound request and the next person to copy this line may not have a
    // fixed host.
    card = (await json(
      // The catalogue the caller named, English by default. A Japanese id is a
      // 404 in the English catalogue and the other way round, so this is the
      // whole of what the language parameter does: pick which one is asked.
      `https://api.tcgdex.net/v2/${language ?? "en"}/cards/${encodeURIComponent(id)}`,
      `${language ?? "en"} card ${id}`,
    )) as {
      id?: string;
      name?: string;
      image?: string;
      rarity?: string;
      illustrator?: string;
      hp?: number;
      types?: string[];
      stage?: string;
      evolveFrom?: string;
      regulationMark?: string;
      /** TCGdex says per card which runs and printings exist; only the stamped run is read here. */
      variants?: { firstEdition?: boolean };
      set?: { id?: string; name?: string; logo?: string; cardCount?: { total?: number } };
      pricing?: {
        cardmarket?: {
          idProduct?: number;
          low?: number | null;
          avg30?: number | null;
          avg?: number | null;
          trend?: number | null;
          avg7?: number | null;
        };
      };
    } | null;
  } catch (err) {
    if (err instanceof CatalogueNotFound) return null;
    throw err;
  }
  if (!card?.id || !card.name) return null;
  const cm = card.pricing?.cardmarket;
  return {
    id: card.id,
    name: card.name,
    image: card.image ?? null,
    rarity: card.rarity ?? null,
    illustrator: card.illustrator ?? null,
    hp: num(card.hp),
    types: card.types ?? [],
    stage: card.stage ?? null,
    evolveFrom: card.evolveFrom ?? null,
    regulationMark: card.regulationMark ?? null,
    firstEdition: card.variants?.firstEdition ?? null,
    set: card.set?.id
      ? {
          id: card.set.id,
          name: card.set.name ?? card.set.id,
          logo: card.set.logo ? `${card.set.logo}.webp` : null,
          total: num(card.set.cardCount?.total),
        }
      : null,
    cmId: num(cm?.idProduct),
    cmUrl: null,
    price: cm ? priceOf(cm) : null,
    market: cm ? { avg: num(cm.avg), trend: num(cm.trend), avg7: num(cm.avg7) } : null,
  };
}
