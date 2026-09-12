/**
 * The one search box behind the add-card dialog, across name, number, set and
 * type at once — against TCGdex.
 *
 * It used to ask pokemontcg.io (see ptcg-search.ts, which this replaces, and
 * git history for why the search is one box rather than one set at a time).
 * That host now refuses roughly three requests in five: measured 2026-09-11,
 * five identical calls answered 200, 500, 502, 500, 500. Three attempts in a
 * row failed often enough that a search for "charizard" came back empty, and
 * an empty answer reads as "no such card" on every screen that shows it. A
 * catalogue that is down three times out of five is not a catalogue.
 *
 * TCGdex is already the vocabulary this repository follows for rarity, type and
 * era, already the source of every non-English shelf, and answers in ~200ms. Its
 * REST list filters on any field, nested ones included (`set.name=like:151`), so
 * the query this box needs is a URL rather than a Lucene string — escapeTerm()
 * and its trap (a wildcarded phrase with a space in it is not one clause) are
 * not needed here.
 *
 * What one search costs: one cached GET for the window of hits, one POST for the
 * rarity and types of the page shown, and the English set index the shelf holds
 * (tcgdex-browse.ts, once a day per process), which names a hit's set and era
 * from its id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphql, json } from "./tcgdex-client";
import { ENERGY_TYPES, MAX_WORDS, searchMirror } from "./mirror";
import { withLimitlessScansPerSet } from "./browse-artwork";
import {
  type BrowseLanguage,
  englishSetIndex,
  isPocketSet,
  listSetsIn,
  type CatalogueSet,
} from "./tcgdex-browse";
import { MAX_RESULTS, type CatalogueMatch, type SearchFilters } from "./ptcg-search";
import { englishCardNames } from "./card-names";
import { setIdOf } from "./tcgdex-language";
import { setIn } from "./tcgdex-browse";

/* One catalogue per language. English is the one every search asked until 2026-09-11; the
   Japanese, Korean and Chinese ones are the same host under their own code, and a name typed in
   their script is found only there — "リザードン" is in none of the English records. */
const catalogueOf = (language: BrowseLanguage | null) =>
  `https://api.tcgdex.net/v2/${language ?? "en"}`;

/**
 * A language's sets by id, for naming a hit's set the way the English index does. listSetsIn()
 * is already cached per request behind json(); the map is rebuilt from it, which is cheap.
 */
async function languageSetIndex(language: BrowseLanguage): Promise<Map<string, CatalogueSet>> {
  return new Map((await listSetsIn(language)).map((s) => [s.id, s]));
}

/**
 * How many hits are read before the words that could not become a filter are
 * matched here. Past this a search is a browse: twelve pages deep at
 * MAX_RESULTS a page, and nobody pages that far looking for one card to add.
 */
const WINDOW = 250;

/** What TCGdex's list answers with: a card brief, and nothing about the card itself. */
type Brief = { id: string; localId?: string; name?: string; image?: string | null };

const lower = (s: string) => s.trim().toLowerCase();

/**
 * A scan's address. TCGdex hands back the stem and leaves the size and the
 * format to the caller; a card whose scan has not been published carries no
 * stem at all and draws as its name.
 */
const scan = (stem: string | null | undefined, size: "low" | "high") =>
  stem ? `${stem}/${size}.webp` : null;

/**
 * The filters TCGdex can answer itself, and the words it cannot.
 *
 * `name`, `localId`, `set.name` and `types` are all filterable, and they are
 * AND'd by the endpoint — but only one value each, and a typed word does not
 * say which field it means. So the first word that could be a name becomes the
 * name filter, a word that is an energy type becomes the type filter, and
 * whatever is left is matched here against name, number and set name: the same
 * four fields the old one-box query OR'd per word, minus nothing.
 */
function quickQuery(term: string): { params: Record<string, string>; words: string[] } | null {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  if (!words.length) return null;

  const params: Record<string, string> = {};
  const rest: string[] = [];
  for (const word of words) {
    const type = ENERGY_TYPES.find((t) => lower(t) === lower(word));
    if (type && !params.types) {
      params.types = type;
      continue;
    }
    // The anchor: the first word with a letter in it is a name, and a term that
    // is only digits ("151") is a number instead — asking for name:*151* finds
    // the cards called 151, which is not what a number was typed for.
    if (!params.name && /\p{L}/u.test(word)) {
      params.name = `like:${word}`;
      continue;
    }
    rest.push(word);
  }
  if (!params.name && !params.types) {
    // Nothing but numbers: the first is the card's, the rest are matched here.
    params.localId = `like:${rest.shift()}`;
  }
  return { params, words: rest };
}

/** The precise alternative to the one box: each filled field targets its own, as typed. */
function filterQuery(filters: SearchFilters): Record<string, string> | null {
  const params: Record<string, string> = {};
  if (filters.name?.trim()) params.name = `like:${filters.name.trim()}`;
  if (filters.number?.trim()) params.localId = `like:${filters.number.trim()}`;
  /* A set arrives as the catalogue spells it, from the chip that listed it, and
     `like:` rather than an exact match because the two catalogues spell a few of
     them differently ("Base" and "Base Set") and the chip's list is not
     necessarily this one. */
  if (filters.set?.trim()) params["set.name"] = `like:${filters.set.trim()}`;
  if (filters.type?.trim()) {
    const typed = lower(filters.type);
    params.types = ENERGY_TYPES.find((t) => lower(t) === typed) ?? filters.type.trim();
  }
  return Object.keys(params).length ? params : null;
}

/** True when every word left over appears in the name, the number or the set name. */
const matchesWords = (card: CatalogueMatch, words: string[]) =>
  words.every((word) => {
    const w = lower(word);
    return (
      lower(card.name).includes(w) ||
      lower(card.number).includes(w) ||
      lower(card.setName).includes(w)
    );
  });

/**
 * Rarity and types for the cards actually shown.
 *
 * The list endpoint carries neither, and both are facts a client must not make
 * the person typing supply — the same reason `series` is carried. One aliased
 * query for the whole page rather than twenty round trips; a card TCGdex cannot
 * answer for comes back null and keeps rarity null and types empty, which is
 * what a search result without them has always looked like.
 */
async function withFacts(cards: CatalogueMatch[]): Promise<CatalogueMatch[]> {
  if (!cards.length) return cards;
  const query = `{ ${cards
    .map((c, i) => `c${i}: card(id: ${JSON.stringify(c.id)}) { rarity types category trainerType }`)
    .join(" ")} }`;
  let facts: Record<
    string,
    {
      rarity?: string | null;
      types?: string[] | null;
      category?: string | null;
      trainerType?: string | null;
    } | null
  > = {};
  try {
    facts = (await graphql(query, "card facts")) as typeof facts;
  } catch (err) {
    // The hits themselves are worth showing; a missing rarity is a row the
    // preview leaves out, and the add still carries the name, set and number.
    console.error("TCGdex card facts unavailable:", err);
    return cards;
  }
  return cards.map((card, i) => {
    const fact = facts?.[`c${i}`];
    return fact
      ? {
          ...card,
          rarity: fact.rarity ?? null,
          types: fact.types ?? [],
          category: fact.category ?? null,
          trainerType: fact.trainerType ?? null,
        }
      : card;
  });
}

/**
 * Takes either a free-text quick-search term or a set of targeted filters,
 * never both — the two are different ways of naming the same query, not two
 * things to combine, and the dialog above this never shows both at once.
 *
 * Throws once TCGdex has been asked and would not answer, rather than returning
 * `[]`. A search that failed and a search that genuinely matched nothing used to
 * be the same shape, and that is the whole of the bug this file was written for:
 * the dialog said "No cards found" about a catalogue that was simply down. The
 * caller decides what unavailable looks like; this function's only job is to not
 * lie about which one happened.
 */
export async function searchCards(
  input: string | SearchFilters,
  page: number = 1,
  /** Which catalogue to ask; null is the English one, the way every search before was. */
  language: BrowseLanguage | null = null,
  /**
   * The store holding the English catalogue's copy (mirror.ts), the service role's client:
   * an English search reads it and asks TCGdex only where the copy is empty. Null, or a store
   * that will not answer, is the way every search before was.
   */
  store: SupabaseClient | null = null,
): Promise<{ cards: CatalogueMatch[]; total: number }> {
  // A Latin-letter term on another shelf is an English name, and TCGdex has none to match it
  // against: リザードンex is what its record says. The committed English names are scanned here.
  if (language && typeof input === "string" && /[A-Za-z]/.test(input))
    return searchEnglishNames(language, input, page);
  // The fielded search on another shelf, as the palette's chips ask it: the set chip names a set
  // the way that shelf shows it (its English title, or its own name), and the term is an English
  // name or nothing. A type is not asked: TCGdex publishes none on these shelves (setIn).
  if (
    language &&
    typeof input !== "string" &&
    (input.set?.trim() || /[A-Za-z]/.test(input.name ?? ""))
  )
    return searchEnglishNames(language, input.name ?? "", page, { set: input.set });
  if (!language && store) {
    const copied = await searchMirror(store, input, page).catch((err) => {
      // The copy is a shortcut, not the catalogue: a store that will not answer costs this
      // search its speed, not its answer.
      console.error(
        "Catalogue copy unavailable, asking TCGdex:",
        err instanceof Error ? err.message : err,
      );
      return null;
    });
    if (copied) return copied;
  }
  const quick = typeof input === "string" ? quickQuery(input) : null;
  const params = typeof input === "string" ? quick?.params : filterQuery(input);
  if (!params) return { cards: [], total: 0 };

  const url = new URL(`${catalogueOf(language)}/cards`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("pagination:page", "1");
  url.searchParams.set("pagination:itemsPerPage", String(WINDOW));

  const brief = ((await json(url.toString(), "card search", { revalidate: 300 })) ?? []) as Brief[];
  const sets = await (language ? languageSetIndex(language) : englishSetIndex()).catch(
    () => new Map<string, CatalogueSet>(),
  );

  const hits = brief
    .filter((c): c is Brief & { localId: string; name: string } => !!c.localId && !!c.name)
    // The mobile game's cards are in the same catalogue; see tcgdex-browse.ts.
    .filter((c) => !isPocketSet(c.id.slice(0, c.id.lastIndexOf("-"))))
    .map((c): CatalogueMatch => {
      const setId = c.id.slice(0, c.id.lastIndexOf("-"));
      const set = sets.get(setId);
      return {
        id: c.id,
        number: c.localId,
        name: c.name,
        localName: null,
        setName: set?.name ?? setId,
        image: scan(c.image, "low"),
        imageHigh: scan(c.image, "high"),
        rarity: null,
        types: [],
        series: set?.series ?? null,
        /* The hit's own id is a TCGdex id, because this is TCGdex. It is what
           everything priced in this repository is keyed by, so a card added from
           search carries the address its price is under. */
        tcgId: c.id,
      };
    });

  const matched = quick?.words.length ? hits.filter((c) => matchesWords(c, quick.words)) : hits;
  const from = (Math.max(1, page) - 1) * MAX_RESULTS;
  /* `total` is what the window holds, so a screen can say "125 cards" above the twenty it
     shows. A window filled to WINDOW means at least that many: the client reads 250 as "250 or
     more", which is the honest thing a capped count can say. */
  const shown = matched.slice(from, from + MAX_RESULTS);
  /* Rarity and type are the English catalogue's facts; the shelves of the other languages leave
     both empty (tcgdex-browse.ts, setIn), and a search in one of them does the same. A Japanese
     hit's picture goes through the same step the set page's does: Limitless's plain print where
     TCGdex has no file, or the wrong one, or the record names none. */
  return {
    cards: language ? await withLimitlessScansPerSet(language, shown) : await withFacts(shown),
    total: matched.length,
  };
}

/**
 * A card on the Japanese, Korean or Chinese shelf, by the English name the app shows it under.
 *
 * TCGdex can filter these catalogues by name, but only by the name the card prints, so
 * "charizard" found nothing on the Japanese shelf while the set page showed Charizard ex under
 * every Lizardon. The English names are ours (card-names.ts, one map per catalogue, committed),
 * so the scan is a walk down twelve thousand strings in memory — no request — and every word
 * typed has to be in the name. The hits are ordered as the shelf is, newest set first and by
 * number within one, and paged as the English search pages.
 *
 * Only the page shown is read from the catalogue: the set each of those twenty cards is in
 * (setIn, one cached GET a day per set), which is where the printed name, the scan's address
 * and the set's English title already are. A set the catalogue lists without its cards (see
 * CatalogueSet.cardsRecorded) has no id in the map and so no hit.
 */
async function searchEnglishNames(
  language: BrowseLanguage,
  term: string,
  page: number,
  /** A set to stay within, as the shelf names it: its English title, its own name, or its id. */
  within: { set?: string } = {},
): Promise<{ cards: CatalogueMatch[]; total: number }> {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const wantedSet = within.set?.trim().toLowerCase() ?? "";
  if (!words.length && !wantedSet) return { cards: [], total: 0 };

  // The shelf's order: the set index is newest first, as listSetsIn writes it.
  const shelf = await languageSetIndex(language).catch(() => new Map<string, CatalogueSet>());
  const setOf = (id: string) => setIdOf(id) ?? id;
  // The sets the chip's word names: by English title, by printed name, or by id — a title the
  // list gives two sets (a Japanese set and its Korean printing share ids, not titles) keeps both.
  const inSets = wantedSet
    ? new Set(
        [...shelf.values()]
          .filter(
            (s) =>
              s.name.toLowerCase() === wantedSet ||
              s.localName?.toLowerCase() === wantedSet ||
              s.id.toLowerCase() === wantedSet,
          )
          .map((s) => s.id),
      )
    : null;
  if (inSets && !inSets.size) return { cards: [], total: 0 };

  const names = englishCardNames(language);
  const ids = Object.keys(names).filter((id) => {
    if (inSets && !inSets.has(setOf(id))) return false;
    if (!words.length) return true;
    const name = names[id]?.toLowerCase();
    return !!name && words.every((w) => name.includes(w));
  });
  if (!ids.length) return { cards: [], total: 0 };

  const rank = new Map([...shelf.keys()].map((id, i) => [id, i]));
  const collate = new Intl.Collator("en", { numeric: true });
  ids.sort(
    (a, b) =>
      (rank.get(setOf(a)) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(setOf(b)) ?? Number.MAX_SAFE_INTEGER) || collate.compare(a, b),
  );

  const from = (Math.max(1, page) - 1) * MAX_RESULTS;
  const shown = ids.slice(from, from + MAX_RESULTS);
  const bySet = new Map<string, Map<string, CatalogueMatch>>();
  for (const setId of new Set(shown.map(setOf))) {
    const set = await setIn(language, setId);
    bySet.set(setId, new Map((set?.cards ?? []).map((c) => [c.id, c])));
  }
  const cards = shown.flatMap((id) => {
    const card = bySet.get(setOf(id))?.get(id);
    return card ? [card] : [];
  });
  return { cards: await withLimitlessScansPerSet(language, cards), total: ids.length };
}
