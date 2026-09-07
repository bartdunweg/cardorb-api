/**
 * One search box for the add-card dialog, across name, number, set and type
 * at once.
 *
 * TCGdex answers "what is in this one set" and nothing broader — resolving a
 * set is the expensive half of catalogue.ts, on purpose cached per set, and a
 * search across all of them would mean paying that cost, uncached, on every
 * keystroke (see the now-deleted /api/v1/catalog/search route this replaces,
 * and git history for why a
 * scoped search stopped being the right shape). pokemontcg.io already indexes
 * every card across every set behind one endpoint with a fielded query
 * syntax, so this asks them instead of TCGdex.
 *
 * Kept out of ptcg.ts on purpose: that file is a narrow, stated fallback for
 * artwork TCGdex has not published, consulted only after a card is already
 * matched. This is a different job — discovery, before any card is chosen —
 * against the same host but not the same contract, and mixing the two would
 * blur what ptcg.ts's own comment promises it is.
 */
import { catalogueTimeout } from "../util";

/** One candidate from a search, with everything the add-card form can use. */
export type CatalogueMatch = {
  id: string;
  number: string;
  name: string;
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
   * what shipped in #241. Filled by withTcgdexScans(), which has already done the match.
   */
  tcgId?: string | null;
};

/** Also read by the dialog, to know whether a full page means more might exist. */
export const MAX_RESULTS = 20;

/**
 * Lucene special characters, escaped so a typed `"`, `:` or `*` cannot change
 * what the query means rather than just being searched for literally.
 *
 * Exported for ptcg-browse.ts, which builds a `set.id:` query against the same
 * host and needs the identical escaping — one rule, not two.
 */
export function escapeTerm(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

/** Matched against name, number, set name and type at once — one word of
 *  whatever was typed, checked against all four fields with OR. */
function clauseFor(word: string): string {
  const escaped = escapeTerm(word);
  const titled = escaped.charAt(0).toUpperCase() + escaped.slice(1);
  return `(name:*${escaped}* OR number:${escaped}* OR set.name:*${escaped}* OR types:${titled}*)`;
}

/** However many words end up in one query — past this it's a paste, not a search. */
const MAX_WORDS = 6;

/**
 * "Charizard 151" has to find Charizard *in* the set named 151, not a card
 * whose name or number literally contains the six-character string
 * "charizard 151" — pokemontcg.io's query parser splits on whitespace itself,
 * so a single wildcarded phrase with a space in it does not mean what it
 * looks like it means. Each word gets its own name/number/set/type clause,
 * and the clauses are joined by a bare space, which pokemontcg.io's Lucene
 * parser treats as AND by default (confirmed against the real API — see
 * the one-box search) — so "charizard 151" becomes "matches charizard-ish AND
 * matches 151-ish", true of exactly the cards this was typed to find.
 */
function buildQuickQuery(term: string): string {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  return words.map(clauseFor).join(" ");
}

/** One filter field, targeted rather than checked against all four —
 *  the point of asking for Name specifically instead of one guessed word. */
function fieldClause(
  field: string,
  value: string,
  { wrap, titleCase }: { wrap: boolean; titleCase?: boolean },
) {
  const escaped = escapeTerm(value.trim());
  const v = titleCase ? escaped.charAt(0).toUpperCase() + escaped.slice(1) : escaped;
  return wrap ? `${field}:*${v}*` : `${field}:${v}*`;
}

export type SearchFilters = { name?: string; number?: string; set?: string; type?: string };

/**
 * The precise alternative to the one-box quick search — see
 * git history for why the
 * alternative is this and not a way to skip search altogether. Each filled
 * field becomes its own targeted clause (unlike buildQuickQuery's one
 * generic four-field OR per word), AND'd together the same way.
 */
function buildFilterQuery(filters: SearchFilters): string {
  const clauses: string[] = [];
  if (filters.name?.trim()) clauses.push(fieldClause("name", filters.name, { wrap: true }));
  if (filters.number?.trim()) clauses.push(fieldClause("number", filters.number, { wrap: false }));
  /* A set's name is a phrase, in quotes: most have a space in them ("Base Set 2",
     "Black & White"), and pokemontcg.io's parser splits an unquoted value on
     whitespace into three clauses that together match nothing — the same trap
     buildQuickQuery's comment describes. Quoted, the name is matched whole, as
     the catalogue spells it. */
  if (filters.set?.trim()) clauses.push(`set.name:"${escapeTerm(filters.set.trim())}"`);
  if (filters.type?.trim())
    clauses.push(fieldClause("types", filters.type, { wrap: false, titleCase: true }));
  return clauses.join(" ");
}

type PtcgCard = {
  id: string;
  number?: string;
  name?: string;
  rarity?: string;
  types?: string[];
  set?: { name?: string; series?: string };
  images?: { small?: string; large?: string };
};

/**
 * Live, so it has to survive a host that answers 500 and 502 more than it
 * should (see ptcg.ts's own note on the same host) without costing the
 * person typing a multi-second stall. Three attempts, a short backoff — not
 * the DAY-scoped pattern used for a fallback resolved once per build, because
 * this runs once per keystroke and has to fail fast if it is going to fail at
 * all. Measured directly against the real host, unauthenticated: 5 failures
 * out of 10 rapid requests, which is why this is 3 attempts rather than 2 —
 * two out of three failing in a row is a real event worth surfacing, not
 * something to retry away indefinitely. A short cache still helps: the same
 * partial word typed twice in one session, or by anyone else that session,
 * costs one request rather than two.
 *
 * Sends an API key when POKEMONTCG_API_KEY is set (see lib/core/env.ts) —
 * unauthenticated requests are rate-limited hard enough that a few keystrokes
 * in a row can start failing, and there is no scaffolding here to queue or
 * throttle around that; a key raises the ceiling instead.
 *
 * Takes either a free-text quick-search term or a set of targeted filters,
 * never both — the two are different ways of building the same q string, not
 * two things to combine. A caller with filters wants the caller with a term
 * to be a strictly separate mode, which is also why the dialog above this
 * never shows both at once.
 *
 * Throws once every attempt is exhausted, rather than returning `[]` — a
 * search that failed and a search that genuinely matched nothing used to be
 * the same shape, which meant a card add-card dialog now depends on entirely
 * (there is no manual-entry fallback any more, see
 * git history) could
 * fail silently. The caller decides what "unavailable" looks like; this
 * function's only job is to not lie about which one happened.
 */
export async function searchCards(
  input: string | SearchFilters,
  page: number = 1,
): Promise<CatalogueMatch[]> {
  const q = typeof input === "string" ? buildQuickQuery(input) : buildFilterQuery(input);
  if (!q) return [];
  const url =
    `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}` +
    `&page=${page}&pageSize=${MAX_RESULTS}&select=id,number,name,rarity,types,set,images`;
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  const ATTEMPTS = 3;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        next: { revalidate: 300 },
        signal: catalogueTimeout(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { data?: PtcgCard[] };
      return (body.data ?? [])
        .filter((c): c is PtcgCard & { number: string; name: string } => !!c.number && !!c.name)
        .map((c) => ({
          id: c.id,
          number: c.number,
          name: c.name,
          setName: c.set?.name ?? "",
          image: c.images?.small ?? null,
          imageHigh: c.images?.large ?? null,
          rarity: c.rarity ?? null,
          types: c.types ?? [],
          series: c.set?.series ?? null,
        }));
    } catch (err) {
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      console.error("pokemontcg.io search unavailable:", err);
      throw new Error("pokemontcg.io search unavailable", { cause: err });
    }
  }
  // Unreachable — the loop above always returns or throws — but TypeScript
  // can't see that from the `for` shape, so this satisfies the return type.
  throw new Error("pokemontcg.io search unavailable");
}
