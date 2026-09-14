import type { BrowseLanguage } from "./tcgdex-browse";
import JA from "../card-names.ja.generated.json";
import SPECIES from "../pokedex.generated.json";
import LOCAL_SPECIES from "../species-names.generated.json";
import { printedNameOf, printedStyleName } from "./english-card-name.mjs";

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
  const name = NAMES[lang][id];
  return name ? printedStyleName(setOf(id), name) : null;
}

/** The set a card id is filed under: everything before its last hyphen ("SV-P-012" is SV-P). */
const setOf = (id: string) => id.slice(0, Math.max(0, id.lastIndexOf("-")));

const STYLED = new Map<BrowseLanguage, Readonly<Record<string, string | null>>>();

/**
 * The whole map of one catalogue, id → English name (null where none), for a search to scan: in the
 * English game's printed style (printedStyleName), worked out once per catalogue.
 */
export function englishCardNames(lang: BrowseLanguage): Readonly<Record<string, string | null>> {
  const had = STYLED.get(lang);
  if (had) return had;
  const styled = Object.fromEntries(
    Object.entries(NAMES[lang]).map(([id, name]) => [
      id,
      name ? printedStyleName(setOf(id), name) : null,
    ]),
  );
  STYLED.set(lang, styled);
  return styled;
}

/**
 * The two names a card shows under: `name` for the app, which is English throughout, and
 * `localName` for what the card itself says, where the two differ. An English name the maps do
 * not have leaves `name` in the catalogue's own script and `localName` null: one name, not the
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

/**
 * What the card itself says, as the copy stores it beside the English name: null for a vintage
 * set's machine-translated or Latin printed name (english-card-name.mjs, printedNameOf), which is
 * no name the card prints. E1-069 Weezing showed おしっこ under its name until 2026-09-14.
 */
export function printedLocalName(
  setId: string,
  localName: string | null,
  name: string,
  category: string | null | undefined,
): string | null {
  return printedNameOf(setId, localName, name, category, SPECIES, LOCAL_SPECIES);
}
