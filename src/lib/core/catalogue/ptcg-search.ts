/**
 * What a catalogue search answers with, and the two things the searches share.
 *
 * The search itself lives in tcgdex-search.ts since 2026-09-11; it used to ask
 * pokemontcg.io from here (see git history), until that host refused three
 * requests in five and "charizard" found nothing. The type stayed, because
 * every browse file and the ownership join already import it from this path,
 * and a rename across nine files buys nothing a comment does not.
 *
 * escapeTerm() stays for ptcg.ts, which still builds `set.id:` queries against
 * pokemontcg.io for TCGplayer's prices and needs Lucene escaping.
 */
/** One candidate from a search, with everything the add-card form can use. */
export type CatalogueMatch = {
  id: string;
  number: string;
  name: string;
  /**
   * What the card itself says, where `name` is a translation of it: a Japanese, Korean or Chinese
   * card is named in English off Cardmarket's product list or its species (card-names.ts), and
   * the printed name rides beside it for the sheet to show in brackets. Null on every English
   * card, and on a card the maps could not name — then `name` is the printed one.
   */
  localName: string | null;
  setName: string;
  image: string | null;
  imageHigh: string | null;
  rarity: string | null;
  types: string[];
  /**
   * The era, as the catalogue names it — pokemontcg.io's `set.series`.
   *
   * Carried for the same reason `rarity` and `types` are: it is a
   * fact about the card, so nobody should be typing it. The whole `set` object
   * was already being requested and this field was simply dropped on the floor,
   * which is why the add-card form still had a text box for it and why one row
   * in the collection reads "Scarlett & Violet".
   */
  series: string | null;
  /**
   * The same card's TCGdex id, where the two catalogues could be matched.
   *
   * pokemontcg.io numbers a set `me5-85` and TCGdex numbers it `me05-085`, and everything priced
   * in this repo is keyed by the second — `cardmarket-ids.generated.json` is 1,634 TCGdex ids.
   * A price looked up by the pokemontcg.io id matches nothing at all, silently, which is exactly
   * what shipped in #241. Filled by the English set page and the search (tcgdex-browse.ts,
   * tcgdex-search.ts), whose hits are TCGdex ids to begin with; the language shelves carry
   * the same id as `id`.
   */
  tcgId?: string | null;
};

/** One page of hits. Also read by the dialog, to know whether a full page means more might exist. */
export const MAX_RESULTS = 20;

/**
 * Lucene special characters, escaped so a typed `"`, `:` or `*` cannot change
 * what a pokemontcg.io query means rather than just being searched for literally.
 */
export function escapeTerm(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

export type SearchFilters = { name?: string; number?: string; set?: string; type?: string };
