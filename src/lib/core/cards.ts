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
 * lib/core/collection.ts is what asks. That split is recent — this file used to
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

import { localise, mapLimit, measure, numberForms } from "./util";
import { json, pricesFor, setCatalogue } from "./catalogue";
import type { CardPrices } from "./tcgdex-client";
import { speciesOf } from "./pokedex";
import { LOCALE } from "./config";
import { limitlessScan } from "./artwork";
import { cardmarketUrl } from "./cardmarket";
import { sameCard } from "./matching";
import { ptcgScan } from "./ptcg";
import type { CollectionRow, Finish } from "./collection-row";

export { sameCard } from "./matching";
export { highScan } from "./artwork";

/**
 * One printing of a card: a rarity, and whether that printing is in the binder
 * or on the wishlist. The same card is often held twice, normally and as a
 * reverse holo, and those are two of these rather than two cards.
 *
 * `id` is the row it came from (lib/core/collection-row.ts's CollectionRow.id)
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
   * How many of this printing. Null on a public payload rather than absent —
   * see forPublic(), which nulls it because how many of a card somebody has is
   * theirs to know. Every path that builds a Variant from a row sets a number.
   */
  quantity: number | null;
  condition: string | null;
  grade: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  /** ISO date, when this printing joined the collection. See CollectionRow.acquiredAt. */
  acquiredAt: string | null;
  /** Kept out of the "latest pull" on the portfolio site. See CollectionRow.excluded. */
  excluded: boolean;
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
import { priceOf } from "./price-basis.mjs";
export { priceOf, holoPriceOf, shownPrice } from "./price-basis.mjs";
export type { Price } from "./price-basis.mjs";
import type { Price } from "./price-basis.mjs";

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
   * The name the collection uses, which is what groups it and what everything
   * addresses it by: the selection in the rail, the card keys, the broken-logo
   * set. It is somebody's own typing and it is not to be prettied up, because
   * changing it changes what a card is.
   */
  name: string;
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
 * So: `reverse-holo` reads the foil fields, `holo` does not. A holo-only card
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
  return (variant.finish === "reverse-holo" && card.priceHolo) || card.price;
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
        quantity: null,
        condition: null,
        grade: null,
        purchasePrice: null,
        purchaseDate: null,
        notes: null,
        isFavorite: false,
        acquiredAt: null,
        excluded: false,
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
 * lib/core/collection.ts does both, because caching a collection is a question
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
};

export async function buildCollection(
  rows: CollectionRow[],
  { prices = true }: BuildOptions = {},
): Promise<CardSet[]> {
  if (!rows.length) return [];

  // Group first, so each set is only resolved once however many cards came from
  // it. This deliberately ignores any cover art set by hand in the store: in
  // Notion those come back as presigned S3 URLs on a host the CSP does not
  // allow, so across a whole grid they would be a wall of blocked images rather
  // than the one that was picked. TCGdex and Limitless are both allowed (see
  // next.config.ts).
  const grouped = new Map<string, CollectionRow[]>();
  for (const row of rows) {
    // The same two guards as ever: a row with no set cannot be placed and a row
    // with no name cannot be drawn. Every adapter applies them when it makes
    // the row, so this is the floor rather than the check.
    if (!row.setName || !row.name) continue;
    const bucket = grouped.get(row.setName) ?? [];
    bucket.push(row);
    grouped.set(row.setName, bucket);
  }
  if (!grouped.size) return [];

  // Three at a time. Forty-eight sets going at once was enough for TCGdex to
  // start refusing, and a refusal is a whole section of the page with no
  // artwork. The per-set work itself is behind a shared cache now (see
  // lib/core/catalogue.ts), so on a warm cache this loop is a lookup rather
  // than a walk and the limit costs nothing.
  const out = await mapLimit([...grouped.entries()], 3, async ([setName, setRows]) => {
    const cat = await setCatalogue(setName);
    const { assetBase, code, setHasScans } = cat;

    // The fallback is one to three HEAD requests per card, so on a set TCGdex
    // does not know at all it would fire hundreds and find nothing. A cap keeps
    // it useful for the handful of cards from a set too new to be indexed,
    // which is the only case it was ever for.
    let fallbacks = 40;

    // One entry per printing first, then folded together below. Splitting it
    // this way keeps the artwork lookup running eight at a time over the rows
    // as they arrived, rather than over an already-grouped structure.
    const printings = await mapLimit(setRows, 8, async (row) => {
      const { name, number } = row;
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
      const tcgBase = !setHasScans
        ? null
        : (matched?.image ??
          (matched?.localId && assetBase ? `${assetBase}/${matched.localId}` : null));
      let image = tcgBase ? localise(`${tcgBase}/low.webp`) : null;
      let imageHigh = tcgBase ? localise(`${tcgBase}/high.webp`) : null;
      if (!image && number && fallbacks > 0) {
        fallbacks--;
        // Limitless first, where the set has a code there. Not every set does,
        // and the second catalogue does not need one: it is asked by set name.
        //
        // Never for a gallery number, though: Limitless renumbers those into the
        // parent set's run, so TG04 would be asked for under the parent's 04 and
        // answer with a different card. That is the offset lib/core/catalogue.ts
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
        key: `${setName}-${number || name}`,
        name,
        number,
        // Joined back into one string, which is what OwnedCard.type has always
        // been and what CardsView, FilterOptions and cards-stats.ts all read.
        // The row carries a list because a multi-select is a list; widening the
        // card to match is a separate change with its own blast radius.
        type: row.types.join(", ") || null,
        gen: row.gen,
        image,
        imageHigh,
        imageSize: measure(image),
        // TCGdex' name where the row matched one, the row's own where it did
        // not. Which Pokémon a card shows is a fact about the card rather than
        // about how it was typed, and the Dex is the one place a misspelling
        // was silently destructive: "Tyrantirar" is not a species, so the card
        // simply was not filed anywhere and Tyranitar read as uncaught. The
        // scans and the prices survive a typo now (see sameCard); this is the
        // rest of that.
        speciesId: speciesOf(matched?.name ?? name),
        // Kept only long enough to look the price up below: it is TCGdex's id
        // for this card, and the price endpoint is the only thing that wants it.
        tcgId: matched?.id ?? null,
        rarity: row.rarity,
        owned: row.owned,
        // The row's own id and inventory facts, carried through untouched so
        // the merge below can build one Variant per row. See Variant's own
        // comment for why these travel this far.
        id: row.id,
        finish: row.finish,
        quantity: row.quantity,
        condition: row.condition,
        grade: row.grade,
        purchasePrice: row.purchasePrice,
        purchaseDate: row.purchaseDate,
        notes: row.notes,
        isFavorite: row.isFavorite,
        acquiredAt: row.acquiredAt,
        excluded: row.excluded,
      };
    });

    // One pass over the whole set rather than a request inside the map above:
    // that map already runs eight at a time, and a nested fetch would have made
    // it eight times eight.
    //
    // Whatever the catalogue already priced is free; the rest is asked for
    // here. With pre-pricing off — which is the default — that is every matched
    // card, exactly as before. With it on, this list is usually empty.
    const wanted = [...new Set(printings.map((p) => p.tcgId).filter(Boolean))] as string[];
    const missing = prices ? wanted.filter((id) => !(id in cat.prices)) : [];
    const fetched = missing.length ? await pricesFor(missing) : new Map<string, CardPrices>();
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
        quantity: p.quantity,
        condition: p.condition,
        grade: p.grade,
        purchasePrice: p.purchasePrice,
        purchaseDate: p.purchaseDate,
        notes: p.notes,
        isFavorite: p.isFavorite,
        acquiredAt: p.acquiredAt,
        excluded: p.excluded,
      };
      if (existing) {
        if (variant.id === null || !existing.variants.some((v) => v.id === variant.id))
          existing.variants.push(variant);
        existing.owned ||= p.owned;
        // The first row of a card may be the one with no artwork, and the same
        // goes for the price: a card held twice is one card, and whichever of
        // its rows TCGdex matched is the one that knows what it is worth.
        existing.image ??= p.image;
        existing.price ??= priceOfId(p.tcgId);
        existing.priceHolo ??= holoOfId(p.tcgId);
        existing.tcgId ??= p.tcgId;
        continue;
      }
      merged.set(p.key, {
        key: p.key,
        name: p.name,
        number: p.number,
        type: p.type,
        gen: p.gen,
        image: p.image,
        imageHigh: p.imageHigh,
        imageSize: p.imageSize,
        speciesId: p.speciesId,
        price: priceOfId(p.tcgId),
        priceHolo: holoOfId(p.tcgId),
        tcgId: p.tcgId,
        variants: [variant],
        owned: p.owned,
      });
    }
    const cards = [...merged.values()];

    return {
      name: setName,
      title: cat.officialName ?? setName,
      logo: cat.logo,
      logoSize: measure(cat.logo),
      releaseDate: cat.releaseDate,
      total: cat.total,
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
  });

  // Newest set first. A set TCGdex has never heard of has no date to sort on
  // and goes last rather than jumping to the front on an empty string.
  return out.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "", LOCALE));
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
  set: { id: string; name: string; logo: string | null; total: number | null } | null;
  /** Cardmarket's product id, which is how a card is addressed on their site. */
  cmId: number | null;
  /** Where to buy it. See cardmarketUrl. */
  cmUrl: string;
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
 * Fails soft like the rest: a card TCGdex does not have, or an outage, returns
 * null and the route 404s rather than rendering an empty frame.
 */
export async function getCardDetail(id: string): Promise<CardDetail | null> {
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
      `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`,
      `card ${id}`,
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
  } catch {
    return null;
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
    set: card.set?.id
      ? {
          id: card.set.id,
          name: card.set.name ?? card.set.id,
          logo: card.set.logo ? `${card.set.logo}.webp` : null,
          total: num(card.set.cardCount?.total),
        }
      : null,
    cmId: num(cm?.idProduct),
    cmUrl: cardmarketUrl(card.id, card.name),
    price: cm ? priceOf(cm) : null,
    market: cm ? { avg: num(cm.avg), trend: num(cm.trend), avg7: num(cm.avg7) } : null,
  };
}
