/**
 * Which of these catalogue cards are already somebody's.
 *
 * The one thing that makes a browse screen worth building rather than a link to
 * pokemontcg.io: opening a set and seeing, at a glance, the twelve you have and
 * the hundred and ninety-five you do not.
 *
 * ── Why this is pure, and why it does not go through buildCollection() ─────
 *
 * cards.ts already joins rows to a catalogue, and reusing it here would be a
 * mistake the collection cache exists to prevent: buildCollection() resolves artwork, prices and
 * species for all sixteen hundred rows against three catalogues, which is
 * precisely the per-request cost that ADR was written to stop paying. Browse
 * needs one boolean per card. So this takes the *raw rows* and does an in-memory
 * join, with no I/O of its own — which is also what makes it testable on its
 * own, the same seam matching.ts has.
 *
 * ── What the join is allowed to believe ────────────────────────────────────
 *
 * Set name and number, and then only if the name agrees. That last clause is
 * Worth restating: twenty-three gallery rows in this collection are filed
 * under a number that belongs to a different card, so a number that lines up is
 * a candidate, not an answer. sameCard() is the same check buildCollection()
 * and ptcgScan() put on their own matches, for the same reason and with the same
 * cost of being wrong — here, a card marked owned that isn't, on the screen
 * somebody uses to decide what to buy.
 *
 * The failure it accepts in exchange is the quieter one: a row whose number is
 * wrong stays unmatched, so a card that is genuinely in the binder shows as
 * missing. That is the trade already chosen — a wrong match is worse
 * than a missing one — and the fix is the row, not the join.
 */

import { sameCard } from "../catalogue/matching";
import { norm } from "../util";
import { galleryParent, isGalleryNumber } from "../catalogue/set-aliases";
import { resolveSetIds } from "../catalogue/set-resolve";
import { cataloguesFor, setIdOf } from "../catalogue/tcgdex-language";
import type { CollectionRow } from "./collection-row";
import type { CatalogueMatch } from "../catalogue/ptcg-search";
import type { BrowseLanguage, CatalogueSet } from "../catalogue/tcgdex-browse";
import type { TcgSet } from "../catalogue/tcgdex-client";

/** What the viewer has of one catalogue card. */
export type Ownership = {
  owned: boolean;
  /** On the wishlist rather than in the binder — the `owned = false` rows. */
  wishlist: boolean;
  /** Summed over the owned rows only; a wishlist entry is not a copy. */
  quantity: number;
  /**
   * Every collection row this card matched, so a client can open the item it
   * holds instead of searching for it again. Plural because one printing can be
   * held twice, or held and also wished for.
   */
  itemIds: string[];
};

/** A catalogue card with the viewer's own answer attached. */
export type BrowseCard = CatalogueMatch & Ownership;

const NONE: Ownership = { owned: false, wishlist: false, quantity: 0, itemIds: [] };

/**
 * A number folded down to what it means rather than how it was typed.
 *
 * The collection pads to three digits and the catalogues mostly do not, so
 * "088" and "88" are one card — util.ts's numberForms() exists for exactly this
 * and takes the other approach, trying every form against an index built from
 * every form. A single canonical form is the cheaper half of the same idea, and
 * it is the one that works here because both sides are being indexed at once:
 * the letters keep their place ("TG01" is not card 1), the digits lose their
 * padding, and case stops mattering.
 */
export const canonNumber = (n: string): string => {
  const m = /^([A-Za-z]*)0*(\d+)(.*)$/.exec(n.trim());
  return m ? `${m[1] ?? ""}${Number(m[2])}${m[3] ?? ""}`.toLowerCase() : norm(n);
};

/** The set half of a card's id: `sv03.5-006` is card 006 of `sv03.5`. */
const setOf = (cardId: string) => cardId.slice(0, cardId.lastIndexOf("-")).toLowerCase();

const keyFor = (setId: string, number: string) => `${setId.toLowerCase()}|${canonNumber(number)}`;

export type OwnershipIndex = {
  /**
   * Which catalogue this index answers for: null for the English shelf, one of
   * the four for its own.
   *
   * It decides what a key even is. The English shelf joins on set name and
   * number, because that is all an English row has ever carried. A shelf of its
   * own joins on the catalogue's card id, which the row carries exactly, so
   * there is no name to normalise, no number to fold and no chance of a wrong
   * match at all.
   */
  language: BrowseLanguage | null;
  /** `set id|canonical number` on the English shelf, the card id on a language's own, to every row filed there. */
  byCard: Map<string, CollectionRow[]>;
  /** The set's id, in the catalogue being shown, to its rows: the counts the set list shows. */
  bySet: Map<string, CollectionRow[]>;
};

/**
 * Build the join side once, then ask it as many times as there are cards.
 *
 * `language` says which shelf is being marked, and the rows are split by the
 * same rule in both directions. A shelf of its own sees only rows that name
 * that catalogue and carry an id there; the English shelf sees everything else.
 *
 * Both halves of that matter, and the second is the one that was already
 * wrong-in-waiting. A Japanese set is shown under an English name, and some of
 * those names are real English sets — Black Bolt is both — so a Japanese row
 * filed under "Black Bolt" would have counted towards the English set's "12 of
 * 207" and drawn an English card as owned. The routes worked around the other
 * direction by passing no rows at all for a language shelf, which is why
 * nothing there has ever shown a mark.
 */
export function ownershipIndex(
  rows: CollectionRow[],
  language: BrowseLanguage | null = null,
  /**
   * The English sets, for the English shelf: a row is filed under the TCGdex
   * set its own set name resolves to, by the same rule buildCollection() uses
   * to match it (set-resolve.ts). Until 2026-09-11 the English join went by
   * set *name*, in pokemontcg.io's spelling, through a table of the places
   * the collection spelled it differently; the shelf reads TCGdex now, and
   * the resolver already knows every one of those places.
   */
  sets: TcgSet[] = [],
): OwnershipIndex {
  const byCard = new Map<string, CollectionRow[]>();
  const bySet = new Map<string, CollectionRow[]>();
  const put = (map: Map<string, CollectionRow[]>, key: string, row: CollectionRow) =>
    map.set(key, [...(map.get(key) ?? []), row]);
  /* A gallery set is a set of its own in TCGdex ("Silver Tempest Trainer Gallery"), and the
     resolver hands a parent's name back with its galleries. Which of them a row belongs to is
     its number: TG12 is in the gallery, 12 is not. */
  const galleries = new Set(sets.filter((s) => galleryParent(s.name) !== null).map((s) => s.id));
  for (const row of rows) {
    if (!row.setName || !row.name) continue;
    const own = row.tcgId && cataloguesFor(row.language).includes(language as BrowseLanguage);
    if (language) {
      if (!own) continue;
      const setId = setIdOf(row.tcgId!);
      put(byCard, row.tcgId!.toLowerCase(), row);
      if (setId) put(bySet, setId.toLowerCase(), row);
      continue;
    }
    // A row that belongs to a catalogue of its own is not on this shelf. Its
    // language says which set it is really from, and the name it is filed under
    // is a translation of ours.
    if (cataloguesFor(row.language).length && row.tcgId) continue;
    const ids = resolveSetIds(row.setName, sets);
    const gallery = isGalleryNumber(row.number);
    const mine = ids.filter((id) => galleries.has(id) === gallery);
    // A row no set claims is a row this shelf cannot mark, and says nothing about.
    for (const id of mine.length ? mine : ids) {
      put(byCard, keyFor(id, row.number), row);
      put(bySet, id.toLowerCase(), row);
    }
  }
  return { language, byCard, bySet };
}

/**
 * Every row that could be this card: its set under any name the collection
 * might have used for it (see set-aliases.ts), at its number, and actually
 * bearing its name.
 */
function rowsFor(index: OwnershipIndex, card: CatalogueMatch): CollectionRow[] {
  // The id is the identity, so there is nothing else to check: no set name to
  // alias, no number to canonicalise, and no sameCard() — which reads Latin
  // letters and could not tell マスカーニャex from トロピウス anyway.
  if (index.language) return index.byCard.get(card.id.toLowerCase()) ?? [];
  // The card's id names its set, so the set half of the key is not a name to alias
  // either: only the number is folded, and the name is still checked.
  const rows = index.byCard.get(keyFor(setOf(card.id), card.number)) ?? [];
  return rows.filter((row) => sameCard(row.name, card.name));
}

/** Fold the matching rows into one answer. */
function summarise(rows: CollectionRow[]): Ownership {
  if (!rows.length) return NONE;
  const held = rows.filter((r) => r.owned);
  return {
    owned: held.length > 0,
    wishlist: rows.some((r) => !r.owned),
    quantity: held.reduce((sum, r) => sum + (r.quantity > 0 ? r.quantity : 1), 0),
    itemIds: rows.map((r) => r.id).filter((id): id is string => !!id),
  };
}

/** What the viewer has of one catalogue card. */
export const ownershipOf = (index: OwnershipIndex, card: CatalogueMatch): Ownership =>
  summarise(rowsFor(index, card));

/** The same, for a whole page of them. */
export const markOwnership = (index: OwnershipIndex, cards: CatalogueMatch[]): BrowseCard[] =>
  cards.map((card) => ({ ...card, ...ownershipOf(index, card) }));

/**
 * How much of a set is held, without fetching the set.
 *
 * The set list shows "12 of 207" for 174 sets at once, and fetching 174 card
 * lists to say so would make the cheapest screen in the app the most expensive.
 * So this counts rows rather than matching cards: it cannot name *which* twelve,
 * and it does not have to.
 *
 * Counted per distinct card, not per copy: two Charizard are one card of the
 * set, as they are on the set page (setId route), which marks each catalogue
 * card once. This used to count copies, on the reasoning that a collection
 * files one row per printing and the caller could clamp; both clients did
 * clamp, and a set with duplicates still read further along than it was, since
 * a second copy stood in for a missing card (#162). A card is its canonical
 * number within the set ("088" and "88" are one), the same key the card match
 * uses. The wishlist count stays per row: a wish is a wanted card, and one row
 * is one wish.
 *
 * A gallery set counts only the gallery-numbered rows of its parent, because
 * that is where the collection files them: without that test "Silver Tempest
 * Trainer Gallery" would claim every Silver Tempest card in the binder.
 */
export function setCounts(
  index: OwnershipIndex,
  set: CatalogueSet,
): { ownedCount: number; wishlistCount: number } {
  if (index.language) {
    // Distinct cards by their catalogue id rather than by number: the number on
    // the row is whatever the client wrote down, and the id is what the row was
    // actually filed under.
    const owned = new Set<string>();
    let wanted = 0;
    for (const row of new Set(index.bySet.get(set.id.toLowerCase()) ?? [])) {
      if (row.owned) owned.add(row.tcgId!.toLowerCase());
      else wanted += 1;
    }
    return { ownedCount: owned.size, wishlistCount: wanted };
  }
  // The gallery question was settled when the row was filed: a TG row is under
  // the gallery's id, not its parent's.
  const rows = index.bySet.get(set.id.toLowerCase()) ?? [];

  const owned = new Set<string>();
  let wishlistCount = 0;
  for (const row of new Set(rows)) {
    if (row.owned) owned.add(canonNumber(row.number));
    else wishlistCount += 1;
  }
  return { ownedCount: owned.size, wishlistCount };
}
