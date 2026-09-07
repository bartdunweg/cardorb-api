import type { CollectionRow } from "./collection-row";
import { cardNumber } from "./csv";
import { norm } from "../util";

/**
 * Which rows of an import the collection already holds.
 *
 * This exists because an import is the one thing this app does that cannot be
 * taken back. `cards_source_idx` is unique on (user_id, source, source_id) and
 * a CSV row has no source_id, and NULLs never collide in Postgres — so running
 * the same file twice writes every card twice, and nothing stops it. The
 * screen's promise ("696 you already have, I will skip those") is kept here.
 *
 * Pure and separate from storage/imports.ts on purpose: reading the collection
 * is a query, deciding is a rule, and only the rule is worth testing.
 */

/**
 * The card-type suffix a collection leaves off and a catalogue prints. Kept in
 * step with the one in catalogue/matching.ts, for the same reason: somebody
 * files "Venusaur" where the card says "Venusaur ex".
 */
const TYPE_SUFFIX = /\s+(ex|gx|v|vmax|vstar|v-union|prime|legend|break|lv\.?\s?x|star)$/i;

/**
 * What makes two rows the same card: the set, the printed number and the name
 * without its card-type suffix. Leading zeros go for the reason numberForms()
 * tries both — one export writes 064 where another writes 64, and they are one
 * card.
 *
 * Two things are deliberately *not* in the key.
 *
 * The finish is not, so a card you own in any printing counts as one you have.
 * That over-matches: somebody who owns the normal and is importing the reverse
 * is told they have it already. The other way round writes a duplicate that
 * cannot be undone, and between a card you add by hand and a collection you
 * prune by hand, this is the cheaper mistake.
 *
 * And sameCard()'s tolerance for misspellings is not, because it is neither
 * symmetric nor hashable and, more to the point, a wrong match here silently
 * drops a card somebody meant to import. Both sides of this comparison are one
 * person's own data; the fuzziness that earns its place when matching a
 * hand-kept row against a catalogue does not earn it here.
 */
export const importKey = (row: { name: string; setName: string; number: string }): string =>
  [
    norm(row.setName),
    cardNumber(row.number).toLowerCase().replace(/^0+/, ""),
    norm(row.name.replace(TYPE_SUFFIX, "")),
  ].join(" ");

/**
 * The rows split into the ones that are new and the ones already held.
 *
 * Rows are never compared against each other, only against the collection: two
 * lines of one file naming the same card in two printings are two cards, and
 * folding them together here would lose one every time.
 */
export function splitExisting(
  rows: CollectionRow[],
  held: ReadonlySet<string>,
): { fresh: CollectionRow[]; existing: CollectionRow[] } {
  const fresh: CollectionRow[] = [];
  const existing: CollectionRow[] = [];
  for (const row of rows) (held.has(importKey(row)) ? existing : fresh).push(row);
  return { fresh, existing };
}
