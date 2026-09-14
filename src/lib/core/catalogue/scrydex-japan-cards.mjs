/**
 * What Scrydex publishes about a Japanese card, read off its public pages, and which of the copy's
 * cards each Scrydex card is.
 *
 * Scrydex (with Bart's permission, 2026-09-14) lists every Japanese expansion with a table of its
 * cards (number, English name, the printed rarity mark) and gives each card a page that embeds the
 * card as JSON: its printed Japanese name, the rarity mark and its long form, the artist, the
 * Pokémon it evolves from, and an English translation of all of it. TCGdex has none of the artist
 * for 5,744 Japanese cards, no printed name for 5,518 and no evolution for 2,985 of its Stage 1 and
 * Stage 2 Pokémon (2026-09-14), and names the old sets' trainers in machine translation.
 *
 * Pure, and an .mjs, so the script that writes the committed map (scripts/scrydex-japan-cards.mjs)
 * and the tests read the same code, as english-card-name.mjs is shared.
 */

/** Lowercase letters and digits only, accents folded. */
export const fold = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The HTML entities Scrydex writes in names and attributes. */
export const unescapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** Full-width folded to half-width, hiragana to katakana and every separator dropped. */
export const kanaKey = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * TCGdex id to Scrydex code, where neither the id nor the title lines up (read by hand 2026-09-14).
 */
export const EXPANSION_BY_HAND = {
  S5a: "swsh5a_ja", // Matchless Fighters, which Scrydex calls Peerless Fighters
  PMCG2: "base2_ja", // Pokémon Jungle, Scrydex's Jungle
  "SM1+": "sm1p_ja", // Sun & Moon strengthening pack
  "sm2+": "sm2p_ja", // Beyond a New Challenge, Scrydex's Facing a New Trial
  SM2p: "sm2p_ja", // the same set, as TCGdex files its cards
  XY11a: "xy11f_ja", // Explosive Fighter, Scrydex's Fever-Burst Fighter
  // Red Flash: Scrydex's xy8b_ja is Blue Shock, and Red Flash wore Blue Shock's logo (2026-09-14).
  XY8b: "xy8r_ja",
};

/**
 * Every Japanese expansion on Scrydex's expansions page, once each: name, code and the slug its
 * address needs.
 *
 * @param {string} page
 * @returns {{ name: string, code: string, slug: string }[]}
 */
export function parseExpansions(page) {
  const seen = new Map();
  for (const m of page.matchAll(
    /data-name="([^"]+)"[^>]*href="\/pokemon\/expansions\/([^"/]+)\/([a-z0-9_]+)"/g,
  )) {
    const code = m[3];
    if (!seen.has(code)) seen.set(code, { name: unescapeHtml(m[1]), code, slug: m[2] });
  }
  return [...seen.values()];
}

/**
 * The Scrydex expansion a TCGdex Japanese set is: by hand, by id, or by its English title.
 *
 * @template {{ name: string, code: string }} E
 * @param {E[]} expansions
 * @param {{ id: string, name: string }} set
 * @returns {E | null}
 */
export function scrydexExpansionFor(expansions, set) {
  const byCode = new Map(expansions.map((e) => [e.code, e]));
  const hand = EXPANSION_BY_HAND[set.id];
  if (hand && byCode.has(hand)) return byCode.get(hand) ?? null;
  const own = byCode.get(`${set.id.toLowerCase().replace(/[^a-z0-9]/g, "")}_ja`);
  if (own) return own;
  const title = fold(set.name);
  const named = expansions.filter((e) => fold(e.name) === title);
  return named.length === 1 ? (named[0] ?? null) : null;
}

/** Scrydex's mark, its dash for "none printed" written as the word. */
export const markOf = (mark) => (mark == null ? null : mark === "\u2014" ? "none" : mark);

/** A printed number without its leading zeros: "006" and "6" are one number. */
export const plainNumber = (n) => String(n ?? "").replace(/^0+(?=\d)/, "");

/**
 * The cards of one page of an expansion's table: number, English name and the rarity mark as
 * Scrydex writes it ("C", "SAR", "●", and a dash, written "none" here, where the card prints none).
 *
 * @param {string} page
 * @param {string} code
 * @returns {{ number: string, name: string, mark: string | null }[]}
 */
export function parseExpansionTable(page, code) {
  const at = page.indexOf('data-view-mode-target="table"');
  if (at < 0) return [];
  const table = page.slice(at, page.indexOf("</table>", at));
  const escaped = code.replace(/[^a-z0-9_]/g, "");
  const out = [];
  const seen = new Set();
  const rows = new RegExp(
    `<tr [^]*?data-url="/pokemon/cards/[^"/]*/${escaped}-([A-Za-z0-9-]+)(?:\\?[^"]*)?"[^>]*>([^]*?)</tr>`,
    "g",
  );
  for (const m of table.matchAll(rows)) {
    const spans = [...m[2].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((s) => s[1]);
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ number: m[1], name: unescapeHtml(spans[0] ?? ""), mark: markOf(spans[2]) });
  }
  return out;
}

/**
 * One card's page, cut to what is kept: the JSON Scrydex embeds for its terminal, read up to the
 * card's variants (their prices are not kept). Null where the page carries none.
 *
 * @param {string} page
 */
export function parseCardPage(page) {
  const attr = 'data-terminal-trigger-json-value="';
  const start = page.indexOf(attr);
  if (start < 0) return null;
  const end = page.indexOf('"', start + attr.length);
  if (end < 0) return null;
  const raw = unescapeHtml(page.slice(start + attr.length, end));
  const cut = raw.indexOf(',"variants":[');
  let data;
  try {
    data = JSON.parse(cut > 0 ? `${raw.slice(0, cut)}}}` : raw).data;
  } catch {
    return null;
  }
  if (!data) return null;
  const en = data.translation?.en ?? {};
  return {
    name: data.name ?? null,
    number: data.number ?? null,
    printed: data.printed_number ?? null,
    mark: data.rarity_code ?? null,
    artist: data.artist || null,
    hp: data.hp ? Number(data.hp) || null : null,
    dex: Array.isArray(data.national_pokedex_numbers) ? data.national_pokedex_numbers : [],
    en: {
      name: en.name ?? null,
      supertype: en.supertype ?? null,
      subtypes: Array.isArray(en.subtypes) ? en.subtypes : [],
      types: Array.isArray(en.types) ? en.types : [],
      evolvesFrom:
        Array.isArray(en.evolves_from) && en.evolves_from.length ? en.evolves_from : null,
      rarity: en.rarity ?? null,
    },
  };
}

/**
 * The words of an English name as matching compares them: Unown's brackets, the gold star and the
 * mechanics' hyphen dropped ("Mewtwo-EX" is "Mewtwo EX", "Unown [F]" is "Unown F").
 */
const nameKey = (name) =>
  fold(
    String(name ?? "")
      .replace(/^Mega\s+(?=.*\bEX$)/i, "M ")
      .replace(/[☆★]/g, " star ")
      .replace(/\bStar\b/g, " star "),
  );

/** The words that are no Pokémon's or trainer's name: owners' marks and mechanics. */
const MECHANICS = new Set([
  "m",
  "mega",
  "ex",
  "gx",
  "v",
  "vmax",
  "vstar",
  "break",
  "legend",
  "star",
  "lv",
  "x",
]);

/** A name's own words, the mechanics left out: "Mega Glalie EX" is glalie. */
const ownWords = (name) =>
  String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w && !MECHANICS.has(w));

/**
 * Which Scrydex card each of a set's cards is.
 *
 * By number first, taken where the English names agree (one holds the other: the copy's "Zubat" is
 * Scrydex's "Brock's Zubat") or the printed Japanese names are one. A card with nothing to compare
 * (its English name is still Japanese text, its printed name missing) is taken by number only where
 * the set's numbering was shown to agree: nine in ten of the cards that could be compared. Otherwise
 * by name, where exactly one Scrydex card of the set carries it. Scrydex numbers some vintage sets
 * its own way (neo2's Unown), which is why a number alone is never enough there.
 *
 * @param {{ number: string, name: string, localName?: string | null }[]} scrydex
 * @param {{ id: string, number: string, name: string, localName?: string | null }[]} cards
 * @returns {Map<string, string>} card id to Scrydex number
 */
export function matchScrydexCards(scrydex, cards) {
  const byNumber = new Map(scrydex.map((c) => [plainNumber(c.number), c]));
  const agrees = (card, there) => {
    const a = nameKey(card.name);
    const b = nameKey(there.name);
    if (/[A-Za-z]/.test(card.name) && a && b && (a.includes(b) || b.includes(a))) return true;
    const ja = kanaKey(card.localName);
    return !!ja && ja === kanaKey(there.localName);
  };
  const comparable = (card, there) =>
    /[A-Za-z]/.test(card.name) || (!!card.localName && !!there.localName);
  let compared = 0;
  let agreed = 0;
  for (const card of cards) {
    const there = byNumber.get(plainNumber(card.number));
    if (!there || !comparable(card, there)) continue;
    compared++;
    if (agrees(card, there)) agreed++;
  }
  const numbersAgree = compared >= 5 && agreed / compared >= 0.9;
  /* In a set whose numbering agrees, a card named another way is still the number's where one of
     all of its own words are Scrydex's: "Mega Glalie EX" at XY8a 061 is Scrydex's "M Glalie-EX", and
     neo2's "Unown D" is not the "Unown [F]" at its number. */
  const sameWords = (card, there) => {
    const theirs = ownWords(there.name);
    const mine = ownWords(card.name);
    return mine.length > 0 && mine.every((w) => theirs.includes(w));
  };
  const out = new Map();
  const taken = new Set();
  for (const card of cards) {
    const there = byNumber.get(plainNumber(card.number));
    if (
      there &&
      (agrees(card, there) ||
        (numbersAgree && (!comparable(card, there) || sameWords(card, there))))
    ) {
      out.set(card.id, there.number);
      taken.add(there.number);
    }
  }
  for (const card of cards) {
    if (out.has(card.id)) continue;
    const key = /[A-Za-z]/.test(card.name) ? nameKey(card.name) : "";
    const ja = kanaKey(card.localName);
    const named = scrydex.filter(
      (c) =>
        !taken.has(c.number) &&
        ((key && nameKey(c.name) === key) || (ja && kanaKey(c.localName) === ja)),
    );
    if (named.length === 1) {
      out.set(card.id, named[0].number);
      taken.add(named[0].number);
    }
  }
  return out;
}
