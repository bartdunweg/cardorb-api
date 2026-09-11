import type { BrowseLanguage } from "./tcgdex-browse";
import JA from "../card-names.ja.generated.json";
import KO from "../card-names.ko.generated.json";
import ZH_CN from "../card-names.zh-cn.generated.json";
import ZH_TW from "../card-names.zh-tw.generated.json";

/**
 * The English name of a card from a catalogue that has none, off the committed maps
 * scripts/language-card-names.mjs writes: Cardmarket's product name first, the species by Dex
 * number second (english-card-name.mjs says how). One map per catalogue, because the ids collide
 * between them — SM1S-001 is a Japanese card and a different Korean one.
 *
 * Null where neither source names the card: a trainer or an energy Cardmarket does not sell, or
 * a card added to TCGdex since the maps were last written. The caller shows the card's own name
 * then, which is at least what the card says.
 */
const NAMES: Record<BrowseLanguage, Record<string, string | null>> = {
  ja: JA,
  ko: KO,
  "zh-cn": ZH_CN,
  "zh-tw": ZH_TW,
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
