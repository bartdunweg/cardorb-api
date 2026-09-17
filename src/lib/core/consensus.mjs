/**
 * One rule for where every card and set fact comes from.
 *
 * Until 2026-09-17 each field picked its source in its own place: rarity in tcgplayer-rules.mjs, a
 * reverse holo in reverse-holo-rules.mjs, a set's name in set-facts-rules.mjs, a release day in a
 * generated file, and the rest by hand in card-fact-corrections.ts. Every one of them was right, and
 * no two of them were written the same way, so "why does this card say that" had a different answer
 * per field and a new field started from nothing.
 *
 * This file is that answer, once. Per field it declares who votes and how heavily; per field and
 * source it declares the biases the source audit of 2026-09-17 found, each with a reason and the day
 * it was written down. Resolution is the same everywhere:
 *
 *   1. Only the sources declared for the field vote, each with its weight.
 *   2. A source with no answer is silent. Silence is not a "no": it takes no side.
 *   3. A source with a declared exception for this field and this card or set does not vote, and is
 *      named in the result as excused, with the reason.
 *   4. A source that copies another for this field (pokemontcg.io's pictures are Scrydex's) votes
 *      only where the source it copies is silent, so one answer is never counted twice.
 *   5. A field may ask for a quorum: the least weight that must have answered, excused sources
 *      counted, before anything is decided at all. One witness is not a consensus on a set's name.
 *   6. The answer with the most weight wins, and is spelt the way the earliest declared source that
 *      gave it spells it. A tie between the top two, or every source alone, changes nothing and is
 *      reported with what each source said.
 *
 * Adding a field is one entry in FIELDS; changing what a source counts for is one number in its
 * `voters`; a bias found tomorrow is one entry in EXCEPTIONS. Nothing else moves.
 *
 * Nothing here fetches. The callers hand it the answers they already hold: the nightly catalogue
 * copy (mirror.ts), the weekly TCGplayer links run, the committed evidence files, and
 * scripts/data-health.mjs, which resolves every field it has answers for and fails where the copy
 * holds something else (R-DATA-004). No request pays for it.
 *
 * Plain JavaScript, like tcgplayer-rules.mjs, because the scripts run on plain node and cannot
 * import TypeScript.
 */

/**
 * Every source that may vote, and what it copies.
 *
 * `copies` maps a field to the source this one takes it from: that answer is the other source's, so
 * it counts once. pokemontcg.io's records now link `images.scrydex.com` for every picture, which is
 * the only copying the audit of 2026-09-17 found; its other fields are its own data on GitHub.
 */
export const SOURCES = {
  tcgdex: { name: "TCGdex", note: "api.tcgdex.net, the vocabulary the copy is written in" },
  tcgplayer: { name: "TCGplayer", note: "its product catalogue through tcgcsv.com" },
  scrydex: { name: "Scrydex", note: "with Bart's permission, extended to every fact 2026-09-17" },
  bulbapedia: {
    name: "Bulbapedia",
    note: "facts only, read by script into a committed file: 403 from GitHub runners",
  },
  pokemontcg: {
    name: "pokemontcg.io",
    note: "its data on GitHub; its own README says not to use it as a primary source",
    copies: { "card.image": "scrydex" },
  },
  pokeapi: { name: "PokéAPI", note: "the species list itself" },
  cardorb: { name: "Card Orb", note: "our own rule over another source's words" },
};

/** An answer as two sources are compared on it: case, accents, punctuation and order aside. */
const plain = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** A day as YYYY-MM-DD, from "2019/01/31", "2019-02-01T00:00:00" or a Date. */
export const day = (v) =>
  v == null
    ? ""
    : String(v instanceof Date ? v.toISOString() : v)
        .slice(0, 10)
        .replaceAll("/", "-");

/** A list of words as one key, in no order and each once. */
const listKey = (v) => [...new Set((Array.isArray(v) ? v : [v]).map(plain))].sort().join("|");

/**
 * Every fact this rule decides: what it is, who votes on it and how heavily, how two answers are
 * compared, and the data-health check that holds the copy to it. The order of `voters` is the order
 * a winning answer's spelling is taken in.
 *
 * `held` is not decoration: a rule nothing checks is dropped or made checkable (CONVENTIONS.md), so
 * a field is declared here only once a check reads it, and scripts/data-health.mjs fails where a
 * named check is gone. Two facts are deliberately absent for that reason: a set's era, which only
 * TCGdex has and which nothing has ever disagreed on, and a card's HP, where TCGdex and
 * pokemontcg.io split on SWSH159 to SWSH162 (310 against 300) and no scan has decided it.
 *
 * A weight is how many votes the source casts. One is the default and what nearly every source has;
 * a heavier number says the field is one source's to lose (a printed number is TCGplayer's, which
 * reads the card's own line, and the others pad or prefix it), and a lighter one says the source is
 * a witness and never a decider on its own.
 *
 * `quorum` is how much weight must have answered before the field is decided, whether or not those
 * answers are excused. Without one, a single source that happens to be the only one with an answer
 * decides; a field that has held two witnesses since it was written says so here.
 */
export const FIELDS = {
  "set.name": {
    what: "The set's official English title",
    held: "Set names and days as the sources agree",
    voters: { bulbapedia: 1, tcgdex: 1, tcgplayer: 1, scrydex: 1, pokemontcg: 1 },
    quorum: 2,
    key: (v) => plain(subsetName(v)),
    spell: (v) => subsetName(v),
  },
  "set.releaseDate": {
    what: "The day the set was first sold",
    held: "Release dates to the day, not the month",
    voters: { bulbapedia: 2, tcgdex: 1, tcgplayer: 1, scrydex: 1, pokemontcg: 1 },
    quorum: 2,
    key: day,
    spell: day,
  },
  "set.printedCode": {
    what: "The code printed on the set's cards",
    held: "No pictures from a shared Limitless code (en)",
    voters: { tcgdex: 2, tcgplayer: 1, pokemontcg: 1 },
  },
  "set.total": {
    what: "How many cards the set holds",
    held: "Newer sets are whole and named as printed",
    voters: { tcgdex: 1, bulbapedia: 1, tcgplayer: 1 },
    key: (v) => String(Number(v)),
  },
  "card.name": {
    what: "The name as the card prints it, marks included",
    held: "Newer sets are whole and named as printed",
    voters: { tcgdex: 1, bulbapedia: 1, tcgplayer: 1, pokemontcg: 1 },
    key: plain,
  },
  "card.number": {
    what: "The number as the card prints it",
    held: "Card labels show the number the card prints",
    voters: { tcgplayer: 2, tcgdex: 1, scrydex: 1, bulbapedia: 1, pokemontcg: 1 },
    key: plain,
  },
  "card.rarity": {
    what: "The rarity word the card's symbol stands for",
    held: "Rarities as TCGplayer's rule gives them",
    voters: { tcgdex: 1, tcgplayer: 1, bulbapedia: 1, scrydex: 1 },
    key: plain,
  },
  "card.finishes": {
    what: "Which printings of the card were made",
    held: "A set's finishes overlap TCGplayer's",
    voters: { tcgplayer: 1, tcgdex: 1, scrydex: 1, bulbapedia: 1 },
    quorum: 2,
    key: listKey,
  },
  "card.holo": {
    what: "Whether the card was printed holofoil rather than plain",
    held: "A card whose rarity says holo offers a holo",
    voters: { tcgdex: 1, tcgplayer: 1, scrydex: 1, bulbapedia: 1 },
    quorum: 2,
    key: (v) => String(Boolean(v)),
  },
  "card.reverseHolo": {
    what: "Whether a plain reverse holo of the card exists",
    held: "Every linked card has a reverse holo decision",
    voters: { tcgdex: 1, tcgplayer: 1, scrydex: 1, bulbapedia: 1 },
    key: (v) => String(Boolean(v)),
  },
  "card.printRun": {
    what: "Which print runs of the card were made (Shadowless, Unlimited, a copyright line)",
    held: "Print runs TCGdex names reach the sheet",
    voters: { tcgdex: 2, tcgplayer: 1, bulbapedia: 1 },
    key: listKey,
  },
  "card.types": {
    what: "The card's energy types",
    held: "Card types and stages as TCGplayer's",
    voters: { tcgdex: 1, tcgplayer: 1, pokemontcg: 1 },
    key: listKey,
  },
  "card.stage": {
    what: "The card's evolution stage",
    held: "Card types and stages as TCGplayer's",
    voters: { tcgdex: 1, tcgplayer: 1, pokemontcg: 1 },
    key: plain,
  },
  "card.illustrator": {
    what: "The artist as the card credits them",
    held: "Cards without an illustrator (en)",
    voters: { tcgdex: 2, pokemontcg: 1, tcgplayer: 1 },
    key: plain,
  },
  "card.regulationMark": {
    what: "The regulation letter printed on the card",
    held: "Newer sets are whole and named as printed",
    voters: { tcgdex: 2, pokemontcg: 1, bulbapedia: 1 },
    key: plain,
  },
  "card.image": {
    what: "The scan shown for the card",
    held: "Card pictures (en)",
    voters: { tcgdex: 1, tcgplayer: 1, pokemontcg: 1, scrydex: 1 },
  },
  "card.species": {
    what: "Which Pokédex slots the card fills",
    held: "Only Pokémon cards fill a Pokédex slot",
    voters: { cardorb: 2, tcgdex: 1, pokemontcg: 1 },
    key: listKey,
  },
  "price.market": {
    what: "What a printing of the card sells for",
    held: "Today's TCGplayer prices",
    voters: { tcgplayer: 2, tcgdex: 1 },
  },
};

/**
 * A subset's title as this app writes it: the parent set's name and the subset's, with no separator.
 * TCGplayer and Scrydex join them with a colon the way a store shelf does ("30th Celebration:
 * Classic Collection"), which is the same separator groupTitle drops from an era prefix; the copy
 * has written "Celebrations Classic Collection" and "Crown Zenith Galarian Gallery" since those sets
 * arrived, and Bulbapedia titles its setlists that way too.
 */
export const subsetName = (name) => String(name ?? "").replace(/:\s+/g, " ");

/**
 * What each source is known to get wrong, where, and since when. A source with an exception that
 * matches does not vote on that field for that card or set: the others decide without it, and the
 * result names it.
 *
 * `when` is given the subject and the answers: `(subject, values)`. The subject is
 * `{ setId, cardId, language, series, released, rarity, name, category }`, as much of it as the
 * caller holds; `values` is what each source said, for a bias that is only a bias for certain
 * answers (a date on the first of a month). A field the caller does not hold is undefined, and an
 * exception that reads it does not match, so an exception is written to be true only of what it
 * means.
 *
 * Every entry here comes from the source audit of 2026-09-17 (its report lists the evidence) or from
 * a decision made after it, and says what was seen rather than that the source is poor.
 */
export const EXCEPTIONS = [
  {
    field: "card.holo",
    source: "tcgdex",
    since: "2026-09-17",
    why: "TCGdex writes `normal` for every card of a set printed holofoil throughout: all 188 cards of 30th Celebration and its Classic Collection, the 2,087 Black & White, XY and Sun & Moon holos of api#495, and the six Yellow A Alternate cards TCGplayer sells as holofoil",
    when: (s) => HOLO_THROUGHOUT.has(s.setId),
  },
  {
    field: "card.finishes",
    source: "tcgdex",
    since: "2026-09-17",
    why: "the same sets: where TCGdex says every card is plain and TCGplayer sells every one as holofoil, TCGdex is describing a set it has no printings for",
    when: (s) => HOLO_THROUGHOUT.has(s.setId),
  },
  {
    field: "card.rarity",
    source: "tcgdex",
    since: "2026-09-14",
    why: 'TCGdex grades an older set\'s holo as a plain "Rare" and writes "None" where it has no word: 1,273 holos and 499 cards without one (tcgplayerRarity in tcgplayer-rules.mjs holds the copy to TCGplayer\'s grade for exactly these)',
    when: (s) => s.rarity == null || NO_RARITY.has(plain(s.rarity)) || plain(s.rarity) === "rare",
  },
  {
    field: "card.rarity",
    source: "tcgplayer",
    since: "2026-09-17",
    why: 'TCGplayer files a Japanese card that prints no rarity mark under "Common" or "None", its default for a shelf it has no word for: 843 and 1,328 cards on 2026-09-17, none of which prints a mark. A Japanese card is left without a rarity unless TCGplayer\'s word says more than no mark (SAYS_MORE in japanese-rarity-rules.mjs)',
    when: (s) => s.language === "ja",
  },
  {
    field: "set.releaseDate",
    source: "tcgdex",
    since: "2026-09-16",
    why: "TCGdex dates about forty English sets before Black & White to the first of their month: Diamond & Pearl 2007/05/01 where the set was sold on May 23, Legends Awakened 2008/08/01 for August 20",
    when: (s, v) => BEFORE_BW.has(s.series) && day(v.tcgdex).endsWith("-01"),
  },
  {
    field: "set.releaseDate",
    source: "scrydex",
    since: "2026-09-17",
    why: "Scrydex carries the same month placeholder for those sets: EX Team Rocket Returns on November 1, 2004, where the set was sold on November 8",
    when: (s, v) => BEFORE_BW.has(s.series) && day(v.scrydex).endsWith("-01"),
  },
  {
    field: "set.releaseDate",
    source: "tcgplayer",
    since: "2026-09-17",
    why: "TCGplayer's publishedOn is wrong for the sets sold before the Diamond & Pearl era and for promo lines: Gym Heroes 2000-10-14 where Bulbapedia has August 14, SM Black Star Promos 2016-12-14",
    when: (s) => BEFORE_DP.has(s.series) || s.promo === true,
  },
  {
    field: "set.releaseDate",
    source: "tcgplayer",
    since: "2026-09-17",
    why: "a TCGplayer group whose publishedOn is more than a year after every other source's is the day tcgcsv last published the group, not a release: the four EX era trainer kits read 2026-09-16 for sets sold in 2004 and 2006",
    when: (_s, v) => {
      const theirs = [v.tcgdex, v.scrydex, v.bulbapedia].map(day).filter(Boolean);
      return (
        theirs.length > 0 &&
        theirs.every((d) => Date.parse(day(v.tcgplayer)) - Date.parse(d) > 400 * 86_400_000)
      );
    },
  },
  {
    field: "set.releaseDate",
    source: "pokemontcg",
    since: "2026-09-17",
    why: "pokemontcg.io carries TCGdex's month placeholders and a pure one for the SVP promos (2023/01/01)",
    when: (s) => BEFORE_BW.has(s.series) === true || s.promo === true,
  },
  {
    field: "set.name",
    source: "tcgplayer",
    since: "2026-09-17",
    why: 'TCGplayer names a group for its shelf, with the era in front ("SWSH12: Silver Tempest"); groupTitle in set-facts-rules.mjs drops that prefix before the vote, and what is left is the title',
    when: () => false,
  },
  {
    field: "set.name",
    source: "tcgdex",
    since: "2026-09-17",
    why: 'TCGdex files the EX era\'s prefix outside the title: ex13 is `name` "Holon Phantoms" with `serie` "EX", where the logo, Bulbapedia\'s setname and TCGplayer\'s group all read "EX Holon Phantoms". Twenty English sets',
    when: (s) => s.series === "ex",
  },
  {
    field: "set.name",
    source: "scrydex",
    since: "2026-09-17",
    why: "Scrydex's expansions table drops the same prefix for the same twenty sets",
    when: (s) => s.series === "ex",
  },
  {
    field: "set.name",
    source: "pokemontcg",
    since: "2026-09-17",
    why: 'pokemontcg.io drops "EX" from 22 of 205 English titles ("Holon Phantoms" for "EX Holon Phantoms", "Base" for "Base Set") and stops adding promos',
    when: () => true,
  },
  {
    field: "set.total",
    source: "tcgplayer",
    since: "2026-09-17",
    why: "TCGplayer counts products, so a set's extras and misprints inflate it: 109 products for Base Set's 102 numbers",
    when: () => true,
  },
  {
    field: "set.total",
    source: "tcgdex",
    since: "2026-09-17",
    why: "TCGdex's total lags a new set by days: 30th Celebration stood at 158 without the three RGB Mew, and its Classic Collection printed 0",
    when: (s) => s.newSet === true,
  },
  {
    field: "card.name",
    source: "tcgdex",
    since: "2026-09-17",
    why: 'TCGdex drops a reprint\'s printed mark: "Palkia" for Palkia LV.X and "Metagross" for Metagross δ in 30th Classic Collection, 48 LV.X names in api#449 (nameWithProductMark puts back the LV.X, δ, ☆ and ◇ a product prints)',
    when: (s) => s.reprint === true,
  },
  {
    field: "card.name",
    source: "tcgplayer",
    since: "2026-09-17",
    why: 'TCGplayer names a product for a shelf, with a qualifier the card does not print ("Mewtwo Star", "Genesect EX (Team Plasma)", "Pikachu (Red Cheeks)"); only the marks it prints are read from it',
    when: () => false,
  },
  {
    field: "card.number",
    source: "tcgplayer",
    since: "2026-09-17",
    why: 'TCGplayer pads an older set\'s number to the set total ("004/102" for 4) and puts a space in a promo\'s letters ("SVP 175"); canonNumber folds both before the vote, and the padding a set really prints is read off Scrydex per set (number-padding.mjs)',
    when: () => false,
  },
  {
    field: "card.number",
    source: "pokemontcg",
    since: "2026-09-17",
    why: "pokemontcg.io drops a number's letter suffix and misses the cards that carry one: Aquapolis 50a, 50b, 74a, 74b, 95a, 95b, 103a, 103b",
    when: () => true,
  },
  {
    field: "card.stage",
    source: "tcgplayer",
    since: "2026-09-17",
    why: "TCGplayer files some V cards under VMAX and does not tell a Baby from a Basic; only the words it spells one way are read (STAGE_WORDS in tcgplayer-rules.mjs), and the 127 differences looked at are in type-stage-accepted.json with a reason",
    when: (s) => s.reviewed === true,
  },
  {
    field: "card.types",
    source: "pokemontcg",
    since: "2026-09-17",
    why: "no disagreement was found where both have a value, so pokemontcg.io fills a gap and never overrules",
    when: (s) => s.tcgdexHasValue === true,
  },
  {
    field: "card.illustrator",
    source: "pokemontcg",
    since: "2026-09-17",
    why: "the same: pokemontcg.io names the artist for 300 of 304 SWSH promos TCGdex leaves null, and agrees everywhere both have one",
    when: (s) => s.tcgdexHasValue === true,
  },
  {
    field: "card.regulationMark",
    source: "pokemontcg",
    since: "2026-09-17",
    why: "the same: pokemontcg.io had J on 159 cards of 30th Celebration the day TCGdex had none",
    when: (s) => s.tcgdexHasValue === true,
  },
  {
    field: "card.species",
    source: "pokemontcg",
    since: "2026-09-17",
    why: "pokemontcg.io's nationalPokedexNumbers named Pawmo for svp-006 Pawmot and has none for SVP 144 to 151",
    when: () => true,
  },
  {
    field: "card.species",
    source: "cardorb",
    since: "2026-09-17",
    why: 'our name match reads a species out of a Trainer\'s name ("Aaron\'s Collection" as Aron, "Clefairy Doll" as Clefairy): 61 English and 77 Japanese cards. Only a Pokémon card fills a slot (fillsPokedexSlot)',
    when: (s) => s.category != null && s.category !== "Pokemon",
  },
  {
    field: "card.image",
    source: "tcgdex",
    since: "2026-09-17",
    why: "TCGdex shows one run's scan for every run of a WotC set: base1-4's is the 1st Edition card, stamp visible, and SV2a's are the Poké Ball print. A run's own picture comes from its TCGplayer product (card_print_pictures)",
    when: (s) => s.run != null && s.run !== "1st-edition",
  },
  {
    field: "price.market",
    source: "tcgdex",
    since: "2026-09-12",
    why: "TCGdex relays TCGplayer's own figure a day late and for fewer printings, so it is the fallback for a card with no TCGplayer link and never a second opinion",
    when: (s) => s.linked === true,
  },
];

/** TCGplayer's and TCGdex's words that are no rarity at all. */
const NO_RARITY = new Set(["none", "unconfirmed"]);

/**
 * The sets TCGdex files as plain that are printed holofoil throughout. Written from TCGplayer's
 * products and Bulbapedia's set pages, never guessed: 30th Celebration ("Every single card included
 * in this set, including Basic Energy cards, is Holofoil"), its Classic Collection (golden bordered
 * reprints), and Yellow A Alternate, whose six cards TCGplayer sells as holofoil but for Trainers'
 * Mail, and whose scans show the foil (xya-107a's card face, 2026-09-17).
 *
 * A set joins this list when data-health's "A set's finishes overlap TCGplayer's" goes red for it and
 * the pictures are looked at, not before.
 */
export const HOLO_THROUGHOUT = new Set(["30th", "30th-c", "xya"]);

/** The eras whose sets came out before Black & White, where TCGdex dates to the first of a month. */
const BEFORE_BW = new Set(["base", "gym", "neo", "ecard", "ex", "pop", "dp", "hgss", "np", "tk"]);
/** The eras before Diamond & Pearl, where TCGplayer's publishedOn is months out. */
const BEFORE_DP = new Set(["base", "gym", "neo", "ecard", "ex", "pop"]);

/**
 * @typedef {object} Resolution
 * @property {string} field
 * @property {"agreed" | "majority" | "tie" | "short" | "silent"} outcome
 * @property {unknown} value the answer that won, or null where nothing did
 * @property {string[]} winners the sources that gave it
 * @property {{ key: string, value: unknown, weight: number, sources: string[] }[]} tally
 * @property {{ source: string, since: string, why: string }[]} excused
 * @property {{ source: string, copies: string }[]} folded
 */

/**
 * Which sources are excused from a field for this subject, each with its reason.
 *
 * @param {string} field
 * @param {Record<string, unknown>} subject
 * @returns {{ source: string, since: string, why: string }[]}
 */
export function exceptionsFor(field, subject = {}, values = {}) {
  return EXCEPTIONS.filter((e) => e.field === field && e.when(subject, values)).map(
    ({ source, since, why }) => ({ source, since, why }),
  );
}

/**
 * The consensus of the sources on one fact.
 *
 * @param {string} field one of FIELDS
 * @param {Record<string, unknown>} subject what the exceptions are read against
 * @param {Record<string, unknown>} values each source's answer; leave a source out or give it null
 *   or undefined for silence
 * @returns {Resolution}
 */
export function resolve(field, subject, values) {
  const declared = FIELDS[field];
  if (!declared) throw new Error(`No consensus field "${field}"`);
  const key = declared.key ?? plain;
  const spell = declared.spell ?? ((v) => v);
  const answered = (source) => values?.[source] !== undefined && values?.[source] !== null;
  /* Only a source that answered can be excused: an exception that takes a vote nobody cast away
     says nothing, and would be read as a source having been overruled. */
  const excused = exceptionsFor(field, subject ?? {}, values ?? {}).filter((e) =>
    answered(e.source),
  );
  const excusedOf = new Set(excused.map((e) => e.source));

  const folded = [];
  /** @type {Map<string, { key: string, value: unknown, weight: number, sources: string[] }>} */
  const tally = new Map();
  for (const [source, weight] of Object.entries(declared.voters)) {
    if (!answered(source) || excusedOf.has(source)) continue;
    const copied = SOURCES[source]?.copies?.[field];
    if (copied && answered(copied) && !excusedOf.has(copied)) {
      folded.push({ source, copies: copied });
      continue;
    }
    const k = key(values[source]);
    const row = tally.get(k) ?? { key: k, value: spell(values[source]), weight: 0, sources: [] };
    row.weight += weight;
    row.sources.push(source);
    tally.set(k, row);
  }

  const rows = [...tally.values()].sort((a, b) => b.weight - a.weight);
  const base = { field, tally: rows, excused, folded };
  if (!rows.length) return { ...base, outcome: "silent", value: null, winners: [] };
  /* The quorum counts every source that answered, an excused one included: an exception says a
     source is wrong here, which is a reason to trust the rest, not a reason to hear fewer. */
  const heard = Object.entries(declared.voters)
    .filter(([source]) => answered(source))
    .reduce((n, [, weight]) => n + weight, 0);
  if (heard < (declared.quorum ?? 1))
    return { ...base, outcome: "short", value: null, winners: [] };
  if (rows.length > 1 && rows[0].weight === rows[1].weight)
    return { ...base, outcome: "tie", value: null, winners: [] };
  return {
    ...base,
    outcome: rows.length === 1 ? "agreed" : "majority",
    value: rows[0].value,
    winners: rows[0].sources,
  };
}

/**
 * One sentence saying what a resolution decided and why, for a data-health line or a pull request.
 *
 * @param {Resolution} result
 * @returns {string}
 */
export function explain(result) {
  const said = result.tally
    .map((r) => `${r.sources.map((s) => SOURCES[s]?.name ?? s).join(" and ")} "${r.value}"`)
    .join("; ");
  const aside = result.excused.length
    ? `; ${result.excused.map((e) => `${SOURCES[e.source]?.name ?? e.source} does not vote (${e.why})`).join("; ")}`
    : "";
  if (result.outcome === "silent") return `${result.field}: nobody answered${aside}`;
  if (result.outcome === "short")
    return `${result.field}: one source only, nothing changed (${said})${aside}`;
  if (result.outcome === "tie")
    return `${result.field}: no majority, nothing changed (${said})${aside}`;
  return `${result.field}: "${result.value}" (${said})${aside}`;
}
