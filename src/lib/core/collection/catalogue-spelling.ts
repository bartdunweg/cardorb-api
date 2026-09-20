/**
 * How a row spells its card: the catalogue copy's name for the card, for its set and for its
 * printed number, on every row being written that names a card the copy holds.
 *
 * A row keeps those three beside the id, and they are read by the collection list, the CSV export
 * and the public profile straight out of the row (storage/postgres.ts). They were written once, from
 * whatever the client or the imported file said, and the catalogue then went on without them:
 * TCGdex folded a gallery's filing name into its title ("Astral Radiance" became "Astral Radiance
 * Trainer Gallery", #306), and a name typed by hand kept its curly apostrophe and its missing
 * accent ("Pokemon Breeder", "Farfetch’d", "Nidoran" for both of them). The same card then read one
 * way on the collection and another on Browse.
 *
 * So the row takes the copy's spelling wherever the copy has the card, at the moment it is written
 * (R-DATA-004). Migration 20260920130000 did the rows that were already there, and the data-health
 * check "Every row spells its card as the catalogue does" counts what drifted since.
 *
 * The number came last, on 2026-09-20. It used to be stored in a form of its own: a promo without
 * its set's letters ("168" for smp-SM168, which prints SM168) and whatever padding was typed ("36"
 * for a card that prints 036), written by storedCardNumber() and held there by the check constraint
 * `cards_number_no_promo_prefix`. That form existed so a promo sorted among its siblings (#356,
 * where parseInt("XY123") was NaN and Venusaur EX sank to the bottom of its binder), and the
 * comparator has folded the prefix itself since the same change, so the stored form was no longer
 * carrying it. The owner chose the printed number, migration 20260920160000 dropped the constraint
 * and moved 1,075 rows, and storedCardNumber() is now only the fallback for a row the copy has no
 * card for.
 *
 * English rows only, like catalogueIdOf() beside it: a Japanese row's card is named in its own
 * script, where `local_name` and not `name` is what the card says, and no row resolves that way
 * today.
 */
import { storedCardNumber } from "../util";
import { cataloguesFor } from "../catalogue/tcgdex-language";
import type { Language } from "./collection-row";

/** What a row says about its card, whatever else it carries. */
export type Spellable = {
  name: string;
  number: string;
  tcgId: string | null;
  language: Language | null;
};

/** One card's spelling as the copy holds it. */
export type CatalogueSpelling = { name: string; setName: string; number: string };

/** Reading and writing the set's name, which a draft calls `set` and an imported row `setName`. */
export type SetField<T> = { of: (row: T) => string; on: (row: T, name: string) => T };

/**
 * The three facts a row should carry, given its card's spelling or none. Pure, for the tests.
 *
 * With a card, the copy's spelling wins outright: the row names that card by id, and the id is held
 * to the copy by catalogueIdOf() on the way in and by data-health afterwards, so there is nothing
 * for a second guard to protect. Without one there is no card to copy, and the number falls back to
 * the form the collection used to store for every row (storedCardNumber): a number typed by hand
 * for a set nobody catalogues still reads better as 123 than as XY123.
 */
export function spellingOf(
  row: Spellable,
  setName: string,
  card: CatalogueSpelling | undefined,
): CatalogueSpelling {
  if (!card || cataloguesFor(row.language).length)
    return { name: row.name, setName, number: storedCardNumber(row.number) };
  return card;
}

/** The copy's spelling for each of these ids, or an empty map where the copy cannot be read. */
async function spellings(ids: string[]): Promise<Map<string, CatalogueSpelling>> {
  if (!ids.length) return new Map();
  try {
    const { adminClient } = await import("@/lib/storage/supabase");
    const { catalogueCardSpellings } = await import("@/lib/storage/postgres");
    const db = adminClient();
    return db ? await catalogueCardSpellings(db, ids) : new Map();
  } catch {
    // A copy that cannot be read is not a row that must not be written: the spelling it came with
    // stands, and the data-health check names it in the morning.
    return new Map();
  }
}

/**
 * Every row spelt as its card is, in one read of the copy.
 *
 * Called on the two paths that write a new row (POST /v1/cards and the import), after
 * withCatalogueIds() has put the copy's id on each of them, so the id this asks by is the right one.
 * `held` is the copy's answer, which the tests pass in and nobody else does.
 */
export async function withCatalogueSpelling<T extends Spellable>(
  rows: T[],
  set: SetField<T>,
  held?: Map<string, CatalogueSpelling>,
): Promise<T[]> {
  const ids = [
    ...new Set(
      rows.filter((r) => r.tcgId && !cataloguesFor(r.language).length).map((r) => r.tcgId!),
    ),
  ];
  const spelt = held ?? (await spellings(ids));
  return rows.map((row) => {
    const out = spellingOf(row, set.of(row), row.tcgId ? spelt.get(row.tcgId) : undefined);
    return set.on({ ...row, name: out.name, number: out.number }, out.setName);
  });
}
