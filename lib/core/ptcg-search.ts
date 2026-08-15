/**
 * One search box for the add-card dialog, across name, number, set and type
 * at once.
 *
 * TCGdex answers "what is in this one set" and nothing broader — resolving a
 * set is the expensive half of catalogue.ts, on purpose cached per set, and a
 * search across all of them would mean paying that cost, uncached, on every
 * keystroke (see the now-deleted /api/v1/catalog/search route this replaces,
 * and docs/feedback/0005-add-card-should-be-one-search-bar.md for why a
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
};

const MAX_RESULTS = 20;

/**
 * Lucene special characters, escaped so a typed `"`, `:` or `*` cannot change
 * what the query means rather than just being searched for literally.
 */
function escapeTerm(term: string): string {
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
 * ADR-0031) — so "charizard 151" becomes "matches charizard-ish AND
 * matches 151-ish", true of exactly the cards this was typed to find.
 */
function buildQuickQuery(term: string): string {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  return words.map(clauseFor).join(" ");
}

/** One filter field, targeted rather than checked against all four —
 *  the point of asking for Name specifically instead of one guessed word. */
function fieldClause(field: string, value: string, { wrap, titleCase }: { wrap: boolean; titleCase?: boolean }) {
  const escaped = escapeTerm(value.trim());
  const v = titleCase ? escaped.charAt(0).toUpperCase() + escaped.slice(1) : escaped;
  return wrap ? `${field}:*${v}*` : `${field}:${v}*`;
}

export type SearchFilters = { name?: string; number?: string; set?: string; type?: string };

/**
 * The precise alternative to the one-box quick search — see
 * docs/feedback/0006-add-card-no-manual-entry-escape-hatch.md for why the
 * alternative is this and not a way to skip search altogether. Each filled
 * field becomes its own targeted clause (unlike buildQuickQuery's one
 * generic four-field OR per word), AND'd together the same way.
 */
function buildFilterQuery(filters: SearchFilters): string {
  const clauses: string[] = [];
  if (filters.name?.trim()) clauses.push(fieldClause("name", filters.name, { wrap: true }));
  if (filters.number?.trim()) clauses.push(fieldClause("number", filters.number, { wrap: false }));
  if (filters.set?.trim()) clauses.push(fieldClause("set.name", filters.set, { wrap: true }));
  if (filters.type?.trim()) clauses.push(fieldClause("types", filters.type, { wrap: false, titleCase: true }));
  return clauses.join(" ");
}

type PtcgCard = {
  id: string;
  number?: string;
  name?: string;
  rarity?: string;
  types?: string[];
  set?: { name?: string };
  images?: { small?: string; large?: string };
};

/**
 * Live, so it has to survive a host that answers 500 and 502 more than it
 * should (see ptcg.ts's own note on the same host) without costing the
 * person typing a multi-second stall. One retry, a short backoff — not the
 * three-attempt, DAY-scoped pattern used for a fallback resolved once per
 * build, because this runs once per keystroke and has to fail fast if it is
 * going to fail at all. A short cache still helps: the same partial word
 * typed twice in one session, or by anyone else that session, costs one
 * request rather than two.
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
 */
export async function searchCards(input: string | SearchFilters): Promise<CatalogueMatch[]> {
  const q = typeof input === "string" ? buildQuickQuery(input) : buildFilterQuery(input);
  if (!q) return [];
  const url =
    `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}` +
    `&pageSize=${MAX_RESULTS}&select=id,number,name,rarity,types,set,images`;
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 300 } });
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
        }));
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      // A search that fails is a search box that shows nothing, not an
      // error — the same "assistance is optional" posture as the rest of
      // this dialog. There is no fallback catalogue to try underneath it.
      console.error("pokemontcg.io search unavailable:", err);
      return [];
    }
  }
  return [];
}
