/**
 * The copy's card id on a row being written, whatever id the row came with.
 *
 * A Dex export names its cards in its own spelling (sv35-52 for TCGdex's sv03.5-052), and older
 * files in pokemontcg.io's (sv4-129 for sv04-129). Written as given, the page still found the card
 * by set and number, but the id was a stale note: the CSV import recognises a held row by it, and a
 * copy's default finish asks the copy by it and read "normal" for a holo-only card. 1,368 of the
 * owner's rows (migration 20260915090000) and 1,336 of other accounts' (20260917120000) were put
 * right by hand; this is the rule that keeps a new row from needing it (R-DATA-004).
 *
 * The row is resolved the way the collection shows it (cardFactsFor in cards.ts): its set name to
 * the copy's sets, its number through indexByNumber's forms, and the card's name held to the row's
 * by sameCard. An id the set already has is kept, and so is one nothing resolves, where the
 * data-health check "Collection rows on a card the copy has" says so. English rows only: a
 * Japanese row is found by its id alone, and has no other way to be found.
 */
import { setCatalogue, type SetCatalogue } from "../catalogue/catalogue";
import { sameCard } from "../catalogue/matching";
import { cataloguesFor } from "../catalogue/tcgdex-language";
import type { Language } from "./collection-row";
import { mapLimit, numberForms } from "../util";

type Resolvable = {
  name: string;
  number: string;
  tcgId: string | null;
  language: Language | null;
};

/** The id a row should carry, given its set's catalogue. Pure, for the tests. */
export function catalogueIdOf(
  row: Resolvable,
  catalogue: Pick<SetCatalogue, "byNumber">,
): string | null {
  if (cataloguesFor(row.language).length) return row.tcgId;
  const cards = Object.values(catalogue.byNumber);
  if (row.tcgId && cards.some((card) => card.id === row.tcgId)) return row.tcgId;
  const match = numberForms(row.number.trim())
    .map((form) => catalogue.byNumber[form.toLowerCase()])
    .find(Boolean);
  // A number that resolves to another Pokémon is a numbering that does not line up (cards.ts).
  if (!match || (match.name && !sameCard(match.name, row.name))) return row.tcgId;
  return match.id;
}

/**
 * Every English row with the copy's id, one set read per set name (the collection's own cached
 * read). A set the catalogue cannot be asked about right now keeps the ids as given: an outage
 * must not stop a write, and the data-health check names what it left.
 */
export async function withCatalogueIds<T extends Resolvable>(
  rows: T[],
  setOf: (row: T) => string,
): Promise<T[]> {
  const names = [
    ...new Set(rows.filter((r) => !cataloguesFor(r.language).length).map(setOf)),
  ].filter((n) => n.trim());
  const catalogues = new Map<string, SetCatalogue>();
  await mapLimit(names, 8, async (name) => {
    try {
      catalogues.set(name, await setCatalogue(name));
    } catch {
      // Unreachable: the ids stand, see above.
    }
  });
  return rows.map((row) => {
    const catalogue = catalogues.get(setOf(row));
    if (!catalogue) return row;
    const tcgId = catalogueIdOf(row, catalogue);
    return tcgId === row.tcgId ? row : { ...row, tcgId };
  });
}
