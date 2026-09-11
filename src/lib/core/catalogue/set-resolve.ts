/**
 * Which TCGdex set a collection set name means.
 *
 * Cut out of catalogue.ts on 2026-09-11, unchanged, because a second caller
 * needed it that must stay pure: the ownership join (collection/ownership.ts)
 * now files an English row under the TCGdex set it resolves to, the same way
 * buildCollection() matches it — one rule, in one place, for "which set is
 * this row from". catalogue.ts re-exports it, so nothing that imported it from
 * there had to move.
 */
import { norm } from "../util";
import type { TcgSet } from "./tcgdex-client";

/**
 * Promo sets are the one place the two vocabularies genuinely disagree rather
 * than merely differing in punctuation, and no amount of loose matching bridges
 * them: "SV" and "SVP" share no substring with "Scarlet & Violet", and the
 * collection says "Wizard" where TCGdex says "Wizards". Everything else matches
 * on name, so this stays a short list of exceptions rather than becoming a
 * mapping table for all 48 sets.
 */
const SET_ALIASES: Record<string, string> = {
  // A print run, not a set: TCGdex only knows the set.
  "set 1 unlimited": "base1",
  "set 1 shadowless": "base1",
  "set 1": "base1",
  "sv black star promos": "svp",
  "svp black star promos": "svp",
  "wizard black star promos": "basep",
  "wizards black star promos": "basep",
  "swsh black star promos": "swshp",
  "sm black star promos": "smp",
  "xy black star promos": "xyp",
  "bw black star promos": "bwp",
  "hgss black star promos": "hgssp",
  "dp black star promos": "dpp",
  "nintendo black star promos": "np",
  // What an export from Dex calls the same five sets. Without these each one
  // resolves, by substring, to the era's *base* set — "Sword & Shield Promos"
  // finds "Sword & Shield" — and a promo then wears the art and the price of
  // whatever card holds its number in that set. Wrong, and silently so.
  "sword & shield promos": "swshp",
  "scarlet & violet promos": "svp",
  "sun & moon promos": "smp",
  "xy promos": "xyp",
  "mega evolution promos": "mep",
  // TCGdex files the trainer kits by the deck's Pokemon and a series number;
  // Dex names the product. No amount of loose matching bridges "Plusle Half
  // Deck" and "EX trainer Kit 2 (Plusle)", and the alternative is a card with
  // no scan and no price. Only the one spelling actually seen — inventing the
  // Minun half of the same product would be guessing at somebody else's words.
  "ex trainer kit: plusle half deck": "tk-ex-p",
};

/**
 * The TCGdex sets one collection set name covers: the set itself, plus any
 * subset whose name extends it.
 *
 * That second part matters more than it sounds. A Sword & Shield set keeps its
 * Trainer Gallery cards (TG01 and up) in a separate set called "<name> Trainer
 * Gallery", and Crown Zenith does the same with its Galarian Gallery. A
 * collector files all of them under the parent set, which is how they think
 * about it, so matching only the parent left every one of those cards without a
 * scan. Nine sets in this collection were empty for exactly this reason.
 */
export function resolveSetIds(setName: string, sets: TcgSet[]): string[] {
  const wanted = norm(setName);

  const alias = SET_ALIASES[setName.trim().toLowerCase()];
  if (alias) return [alias];

  const exact = sets.find((s) => norm(s.name) === wanted);
  // The longest overlap wins, not the first one in the list. "EX Dragon
  // Frontiers" contains both "Dragon Frontiers" and "Dragon", and TCGdex lists
  // Dragon (ex3) twelve sets before Dragon Frontiers (ex15), so taking the
  // first match filed every Dragon Frontiers card under the wrong set — with
  // the wrong scan and the wrong price, and no sign that anything went wrong.
  const main =
    exact ??
    sets
      .filter((s) => norm(s.name).includes(wanted) || wanted.includes(norm(s.name)))
      .sort((a, b) => norm(b.name).length - norm(a.name).length)[0];
  if (!main) return [];

  // Only extensions of the matched name *that TCGdex files under it*, so
  // "Evolutions" never drags in "Evolving Skies" and a parent never pulls in an
  // unrelated set.
  //
  // The name alone was not enough, and the case that showed it is "Dragon":
  // "Dragon Frontiers", "Dragons Exalted", "Dragon Vault" and "Dragon Majesty"
  // all start with it and are four other sets entirely, so a Dragon card could
  // be drawn and priced as a Dragons Exalted one. A real subset shares its
  // parent's id as well as its name — swsh10 has swsh10tg, swsh12.5 has
  // swsh12.5gg — and neither test alone is safe: the id alone would give
  // "Sword & Shield" (swsh1) every set from swsh10 to swsh12.5.
  const subsets = sets.filter(
    (s) => s.id !== main.id && norm(s.name).startsWith(norm(main.name)) && s.id.startsWith(main.id),
  );
  return [main.id, ...subsets.map((s) => s.id)];
}
