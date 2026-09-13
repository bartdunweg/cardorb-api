import type { BrowseLanguage } from "./tcgdex-browse";
import JA from "../card-names.ja.generated.json";

/**
 * The English name of a card from a catalogue that has none, off the committed maps
 * scripts/language-card-names.mjs writes: the species by Dex number or by the name printed on
 * the card (english-card-name.mjs says how), and for most cards written before 2026-09-12
 * Cardmarket's product name, kept as it was. One map per catalogue, keyed by that catalogue's
 * own card ids.
 *
 * Null where nothing names the card: a trainer or an energy with no English name on record, or
 * a card added to TCGdex since the maps were last written. The caller shows the card's own name
 * then, which is at least what the card says.
 */
const NAMES: Record<BrowseLanguage, Record<string, string | null>> = {
  ja: JA,
};

export function englishCardName(lang: BrowseLanguage, id: string): string | null {
  return NAMES[lang][id] ?? null;
}

/** The whole map of one catalogue, id → English name (null where none), for a search to scan. */
export function englishCardNames(lang: BrowseLanguage): Readonly<Record<string, string | null>> {
  return NAMES[lang];
}

/**
 * The two names a card shows under: `name` for the app, which is English throughout, and
 * `localName` for what the card itself says, where the two differ. An English name the maps do
 * not have leaves `name` in the catalogue's own script and `localName` null — one name, not the
 * same one twice.
 */
export function cardNamed(
  lang: BrowseLanguage,
  id: string,
  own: string,
): { name: string; localName: string | null } {
  const english = englishCardName(lang, id);
  return english && english !== own
    ? { name: english, localName: own }
    : { name: own, localName: null };
}
