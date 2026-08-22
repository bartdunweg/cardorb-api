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

import { sameCard } from "./matching";
import { norm } from "./util";
import { collectionSetNames, galleryParent, isGalleryNumber } from "./set-aliases";
import type { CollectionRow } from "./collection-row";
import type { CatalogueMatch } from "./ptcg-search";
import type { CatalogueSet } from "./ptcg-browse";

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

const keyFor = (setName: string, number: string) => `${norm(setName)}|${canonNumber(number)}`;

export type OwnershipIndex = {
  /** `normalised set name|canonical number` to every row filed there. */
  byCard: Map<string, CollectionRow[]>;
  /** Normalised set name to its rows, for the counts the set list shows. */
  bySet: Map<string, CollectionRow[]>;
};

/** Build the join side once, then ask it as many times as there are cards. */
export function ownershipIndex(rows: CollectionRow[]): OwnershipIndex {
  const byCard = new Map<string, CollectionRow[]>();
  const bySet = new Map<string, CollectionRow[]>();
  for (const row of rows) {
    if (!row.setName || !row.name) continue;
    const card = keyFor(row.setName, row.number);
    byCard.set(card, [...(byCard.get(card) ?? []), row]);
    const set = norm(row.setName);
    bySet.set(set, [...(bySet.get(set) ?? []), row]);
  }
  return { byCard, bySet };
}

/**
 * Every row that could be this card: its set under any name the collection
 * might have used for it (see set-aliases.ts), at its number, and actually
 * bearing its name.
 */
function rowsFor(index: OwnershipIndex, card: CatalogueMatch): CollectionRow[] {
  const number = canonNumber(card.number);
  const out: CollectionRow[] = [];
  for (const setName of collectionSetNames(card.setName)) {
    for (const row of index.byCard.get(`${setName}|${number}`) ?? []) {
      if (sameCard(row.name, card.name)) out.push(row);
    }
  }
  /* Deduped because two of the alias names can resolve to the same bucket — a
     gallery set whose parent is also spelled the same after normalising. */
  return [...new Set(out)];
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
 * Counted per printing rather than per distinct card, which is the honest
 * reading of a collection that files one row per printing (see
 * collection-row.ts): two copies of the same Charizard are two rows and the
 * number goes up. It can therefore exceed the set's total on a heavily
 * duplicated set, which is true rather than wrong — the caller clamps it if the
 * sentence it is writing needs it to be a fraction.
 *
 * A gallery set counts only the gallery-numbered rows of its parent, because
 * that is where the collection files them: without that test "Silver Tempest
 * Trainer Gallery" would claim every Silver Tempest card in the binder.
 */
export function setCounts(
  index: OwnershipIndex,
  set: CatalogueSet,
): { ownedCount: number; wishlistCount: number } {
  const gallery = galleryParent(set.name) !== null;
  const rows = collectionSetNames(set.name)
    .flatMap((name) => index.bySet.get(name) ?? [])
    .filter((row) => isGalleryNumber(row.number) === gallery);

  let ownedCount = 0;
  let wishlistCount = 0;
  for (const row of new Set(rows)) {
    if (row.owned) ownedCount += row.quantity > 0 ? row.quantity : 1;
    else wishlistCount += 1;
  }
  return { ownedCount, wishlistCount };
}
