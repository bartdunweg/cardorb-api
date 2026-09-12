import type { CollectionRow } from "./collection-row";
import { cardNumber } from "./csv";
import { norm } from "../util";

/**
 * Which rows of an import the collection already holds.
 *
 * It counts; it does not decide. Every row of a file is written — a file is a
 * list of copies somebody has, and a second copy of a card is a normal thing to
 * own. What this is for is the sentence the screen shows first: "93 of these
 * name a card you already have."
 *
 * That sentence is the only warning there is. `cards_source_idx` is unique on
 * (user_id, source, source_id), a CSV row has no source_id, and NULLs never
 * collide in Postgres — so importing the same file twice writes every card
 * twice and nothing in the database stops it. Somebody about to do that sees
 * a number equal to their whole file.
 *
 * Pure and separate from storage/imports.ts on purpose: reading the collection
 * is a query, counting is a rule, and only the rule is worth testing.
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
 * That over-matches — the normal you own answers for the reverse you are
 * importing — and it is the right way to be wrong for a count whose job is to
 * catch a whole file being imported twice: a collection filled from Notion has
 * no finish on most of its rows, so keying on one would report nothing and warn
 * nobody. It would be the wrong way to be wrong if this decided what to write.
 * It does not.
 *
 * And sameCard()'s tolerance for misspellings is not, because it is neither
 * symmetric nor hashable, and a count is not worth an edit-distance pass over
 * two thousand rows squared.
 */
/**
 * The name a set goes by, for the name a row filed it under.
 *
 * Since 2026-09-11 a set goes by its official name everywhere it is shown
 * (cards.ts, mergeSetsByTitle), and a file names sets the official way too.
 * The rows in the collection still carry what they were filed under: a Notion
 * import wrote "Set 1 Unlimited" for Base Set, and keyed on that, a Dex export
 * of the same cards counted as 0 already held (2026-09-12). So the key goes
 * through this first, on both sides. storage/imports.ts builds it from the
 * catalogue; the identity is the default, which is what a test and an offline
 * catalogue get.
 */
export type TitleOf = (setName: string) => string;

const asFiled: TitleOf = (setName) => setName;

export const importKey = (
  row: { name: string; setName: string; number: string },
  titleOf: TitleOf = asFiled,
): string =>
  [
    norm(titleOf(row.setName)),
    cardNumber(row.number).toLowerCase().replace(/^0+/, ""),
    norm(row.name.replace(TYPE_SUFFIX, "")),
  ].join(" ");

/**
 * Every key a row can be recognised by: its catalogue id, and the name key above.
 *
 * The id is the exact answer and the reason this exists. Dex writes the catalogue id in its
 * sixth column and this app's export writes it too, and the rows in the collection have carried
 * one since the catalogue backfill, so for most of a real file both sides know the same
 * `bw5-48`. Compared on that, none of the guessing matters: not the set's name, not a
 * misspelling, not "48/108" against "48".
 *
 * Both keys, not the best one. A file row with an id and a held row without it (or the other way
 * round) must still meet, and they can only meet on the name. So every row offers both and a
 * match on either is a match, which is the one shape that cannot go quiet in either direction.
 *
 * It is also what makes the name fold cheap: a name key is only ever *needed* by a row with no
 * id, so storage/imports.ts asks the catalogue about those names alone. On a Dex export against
 * this collection that is none of them, and the preview stops waiting on a hundred set reads.
 */
export const importKeys = (
  row: { name: string; setName: string; number: string; tcgId?: string | null },
  titleOf: TitleOf = asFiled,
): string[] => {
  const name = importKey(row, titleOf);
  return row.tcgId ? [`id ${row.tcgId.toLowerCase()}`, name] : [name];
};

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
  titleOf: TitleOf = asFiled,
): { fresh: CollectionRow[]; existing: CollectionRow[] } {
  const fresh: CollectionRow[] = [];
  const existing: CollectionRow[] = [];
  for (const row of rows) {
    const known = importKeys(row, titleOf).some((k) => held.has(k));
    (known ? existing : fresh).push(row);
  }
  return { fresh, existing };
}
