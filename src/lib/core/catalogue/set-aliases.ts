/**
 * Where the collection and pokemontcg.io call the same set different things.
 *
 * This used to be three lines inside ptcg.ts, private to the artwork fallback,
 * which was right for as long as one file asked the question. Browse asks it
 * twice more and in the other direction — given a set pokemontcg.io lists, which
 * name would this collection have filed it under — so the table moved here and
 * grew a reverse index rather than being copied.
 *
 * Deliberately not merged with SET_ALIASES in catalogue.ts. That table maps a
 * collection set name to a *TCGdex id*; this one maps it to a *pokemontcg.io
 * name*. Two catalogues, two vocabularies, and folding them into one record
 * would mean a lookup that cannot say which of the two it answered.
 *
 * Short on purpose. Of 174 sets, only the promos genuinely disagree — "SV" and
 * "Scarlet & Violet" share no substring, and the collection writes "Wizard"
 * where pokemontcg.io writes "Wizards". Everything else matches on the
 * normalised name, which is why this is a list of exceptions rather than a
 * mapping table for every set.
 */

import { norm } from "../util";

/**
 * Keyed by the *normalised* collection name, because that is what the lookup
 * has in hand: norm() strips the spaces and the ampersand, so a key written out
 * in words would never match. Values are pokemontcg.io's own names, verbatim.
 */
const ALIAS: Record<string, string> = {
  svblackstarpromos: "Scarlet & Violet Black Star Promos",
  svpblackstarpromos: "Scarlet & Violet Black Star Promos",
  wizardblackstarpromos: "Wizards Black Star Promos",
};

/** What pokemontcg.io calls a set this collection names `setName`, or null. */
export const ptcgSetName = (setName: string): string | null => ALIAS[norm(setName)] ?? null;

/* Built once, from the table above, so the two directions cannot drift apart:
   several collection spellings can mean one pokemontcg.io set (SV and SVP both
   do), which is why the value is an array. */
const REVERSE = ((): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const [collection, ptcg] of Object.entries(ALIAS)) {
    const key = norm(ptcg);
    out.set(key, [...(out.get(key) ?? []), collection]);
  }
  return out;
})();

/**
 * The gallery suffix, as both catalogues write it: a Sword & Shield set keeps
 * its Trainer Gallery cards in a set of its own, named by extending the parent
 * ("Silver Tempest Trainer Gallery", "Crown Zenith Galarian Gallery").
 *
 * The collection files them under the parent, the way a collector thinks about
 * them, so a browse of the gallery set has to look for its cards under a set
 * name that is missing the last two words. Matched as a trailing "<something>
 * gallery" rather than by listing "Trainer" and "Galarian", for the same reason
 * ptcg.ts and catalogue.ts both match galleries by prefix: those two are not the
 * only words this could ever be.
 */
const GALLERY_SUFFIX = /\s+\S+\s+gallery$/i;

/**
 * A gallery number: Trainer Gallery's TG01 and up, Crown Zenith's GG01 and up.
 *
 * Here rather than in ptcg.ts, where it was written, because it is the other
 * half of the same fact: a gallery set is named by extending its parent, and
 * its cards are numbered by prefixing theirs. Two files ask both halves now —
 * artwork resolution and the ownership join — and one of them has no business
 * importing a module full of fetches to get at a regular expression. ptcg.ts
 * re-exports it so nothing that already imported it from there had to move.
 */
export const isGalleryNumber = (number: string) => /^(TG|GG)\d/i.test(number.trim());

/** The parent set a gallery subset belongs to, or null when this is not one. */
export const galleryParent = (ptcgName: string): string | null => {
  const parent = ptcgName.replace(GALLERY_SUFFIX, "");
  return parent && parent !== ptcgName ? parent : null;
};

/**
 * The name to hand `setCatalogue()` for a set pokemontcg.io calls `ptcgName`,
 * or null where there is no point asking.
 *
 * Checked against both catalogues' real set indexes: of pokemontcg.io's 174
 * sets, 171 resolve to the right TCGdex set on the name alone, through
 * `resolveSetIds()`'s exact-then-loose match. The three below do not, and two of
 * them fail *silently and wrongly* rather than finding nothing — "Scarlet &
 * Violet Black Star Promos" and "Scarlet & Violet Energies" both loosely match
 * TCGdex's "Scarlet & Violet", which would offer the base set's pictures for a
 * promo. The name-check on every card catches that anyway, but not asking is
 * cheaper than asking and disbelieving the answer.
 *
 * A gallery always resolves through its parent rather than through itself, the
 * same way buildCollection() does: TCGdex lists a gallery subset's cards with no
 * image of their own, and files the files under the parent's asset path
 * (swsh12.5/GG69, not swsh12.5gg/GG69). Asking for the subset directly would
 * pick up the wrong `assetBase` and build 404s. Asking for "Silver Tempest"
 * returns the parent *and* its Trainer Gallery, which is what is wanted.
 */
const TCGDEX_SET_NAMES: Record<string, string> = {
  /* TCGdex spells this one with the abbreviation the cards carry. The value
     lands in catalogue.ts's own SET_ALIASES table, which maps it to `svp`. */
  "scarlet & violet black star promos": "SVP Black Star Promos",
  /* Singular there, plural here. */
  "scarlet & violet energies": "Scarlet & Violet Energy",
  /* Named for its year rather than for being a collection. */
  "pokémon futsal collection": "Pokémon Futsal 2020",
};

export const tcgdexSetName = (ptcgName: string): string | null => {
  const parent = galleryParent(ptcgName);
  if (parent) return parent;
  const name = ptcgName.trim();
  if (!name) return null;
  return TCGDEX_SET_NAMES[name.toLowerCase()] ?? name;
};

/**
 * Every normalised set name this collection might have used for a set
 * pokemontcg.io calls `ptcgName` — its own name first, then any alias, then the
 * parent it would file a gallery subset under.
 *
 * A list rather than one answer because all three can be true at once and the
 * caller wants the union: a row is this card's row whichever of the names it
 * happens to be filed under.
 */
export const collectionSetNames = (ptcgName: string): string[] => {
  const key = norm(ptcgName);
  const names = [key, ...(REVERSE.get(key) ?? [])];
  const parent = galleryParent(ptcgName);
  if (parent) names.push(norm(parent));
  return [...new Set(names.filter(Boolean))];
};
