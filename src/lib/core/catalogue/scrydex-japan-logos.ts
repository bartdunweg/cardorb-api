/**
 * The wordmark of a Japanese set, from Scrydex.
 *
 * No source Card Orb read had one: TCGdex names no logo for any of its 169 Japanese sets, TCGplayer
 * and Limitless publish none (Limitless only a 54 px set symbol). Scrydex lists every Japanese
 * expansion with its logo (229 on 2026-09-14, scrydex.com/pokemon/jp/expansions) and gave Bart
 * permission that day to keep them; the nightly copy stores each in our bucket (mirror-language.ts).
 *
 * Scrydex names sets its own way (TCGdex's S4a is its swsh4a_ja, PMCG1 its base1_ja), so a set is
 * found by id first, by its English title next, and by hand for the few Scrydex titles differently.
 */
import { catalogueTimeout } from "../util";
import { fold, parseExpansions, scrydexExpansionFor } from "./scrydex-japan-cards.mjs";

export { parseExpansions, scrydexExpansionFor };

export type ScrydexExpansion = { name: string; code: string; slug?: string };

/** Every Japanese expansion Scrydex lists, off its expansions page: name and code. */
export async function scrydexJapanExpansions(): Promise<ScrydexExpansion[]> {
  const res = await fetch("https://scrydex.com/pokemon/jp/expansions", {
    headers: { "User-Agent": "cardorb.com" },
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`Scrydex expansions: ${res.status}`);
  return parseExpansions(await res.text());
}

/** The Scrydex logo address for a TCGdex Japanese set, or null where Scrydex lists no such set. */
export function scrydexLogoFor(
  expansions: ScrydexExpansion[],
  set: { id: string; name: string },
): string | null {
  const code = scrydexExpansionFor(expansions, set)?.code;
  return code ? `https://images.scrydex.com/pokemon/${code}-logo/logo` : null;
}

// ── Scans ─────────────────────────────────────────────────────────────────────

/** One card as Scrydex lists it on an expansion's page: its number and its name, folded. */
export type ScrydexCard = { number: string; name: string };

/** The cards on one expansion's page, one per number. Exported for its test. */
export function parseExpansionCards(page: string, code: string): ScrydexCard[] {
  const seen = new Map<string, ScrydexCard>();
  const escaped = code.replace(/[^a-z0-9_]/g, "");
  for (const m of page.matchAll(
    new RegExp(`href="/pokemon/cards/([^"/]+)/${escaped}-([A-Za-z0-9]+)`, "g"),
  )) {
    if (!seen.has(m[2]!)) seen.set(m[2]!, { number: m[2]!, name: fold(m[1]!) });
  }
  return [...seen.values()];
}

/** Every card Scrydex lists for one Japanese expansion. */
export async function scrydexExpansionCards(expansion: ScrydexExpansion): Promise<ScrydexCard[]> {
  if (!expansion.slug) return [];
  const res = await fetch(
    `https://scrydex.com/pokemon/expansions/${expansion.slug}/${expansion.code}`,
    { headers: { "User-Agent": "cardorb.com" }, signal: catalogueTimeout() },
  );
  if (!res.ok) throw new Error(`Scrydex ${expansion.code}: ${res.status}`);
  return parseExpansionCards(await res.text(), expansion.code);
}

/**
 * The name the copy has for a card, as a Scrydex name is compared with it: folded, a word the name
 * map repeats said once ("Bayleef Bayleef" is Bayleef). Empty for a name with no Latin letter.
 */
const englishKey = (name: string) => {
  const words: string[] = [];
  for (const w of name.match(/[A-Za-z0-9'’.-]+/g) ?? [])
    if (!words.length || fold(w) !== fold(words[words.length - 1]!)) words.push(w);
  return fold(words.join(" "));
};

/**
 * Which Scrydex number each of a set's cards is.
 *
 * By number where the names agree: Scrydex's name has to contain the copy's ("Brock's Zubat" is the
 * copy's Zubat), because Scrydex numbers some vintage sets its own way. A card whose name has no
 * Latin letter to compare is taken by number only where the set's numbering was shown to agree:
 * nine in ten of its named cards. Otherwise by name, where exactly one Scrydex card carries it.
 * Measured 2026-09-14 over the 1,194 Japanese cards with no picture: 1,129 matched, 63 not.
 */
export function scrydexNumbers(
  scrydex: ScrydexCard[],
  cards: { id: string; number: string; name: string }[],
): Map<string, string> {
  const byNumber = new Map(scrydex.map((c) => [c.number, c]));
  const plain = (n: string) => n.replace(/^0+(?=\d)/, "");
  let compared = 0;
  let agreed = 0;
  for (const card of cards) {
    const key = englishKey(card.name);
    const there = byNumber.get(plain(card.number));
    if (!key || !there) continue;
    compared++;
    if (there.name.includes(key)) agreed++;
  }
  const numbersAgree = compared >= 5 && agreed / compared >= 0.9;
  const out = new Map<string, string>();
  for (const card of cards) {
    const key = englishKey(card.name);
    const there = byNumber.get(plain(card.number));
    if (there && (key ? there.name.includes(key) : numbersAgree)) {
      out.set(card.id, there.number);
      continue;
    }
    if (!key) continue;
    const named = scrydex.filter((c) => c.name.includes(key));
    if (named.length === 1) out.set(card.id, named[0]!.number);
  }
  return out;
}

/** What Scrydex answers for a card it does not have: a 200 with a stand-in, English or Japanese. */
const STAND_INS = [
  "cfl2loWl84E8tUjrC-Q-I0D0JhCRBILXPqV9Rt6Cz3DQ",
  "cfg13PmuXBh86lu9yEZXSfnDuOCRBILXPqV9Rt6Cz3DQ",
];

/** Scrydex's scan of one Japanese card, where there is a real one behind the address. */
export async function scrydexJapanScan(code: string, number: string): Promise<string | null> {
  const url = `https://images.scrydex.com/pokemon/${code}-${number}/large`;
  try {
    const head = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: catalogueTimeout(),
    });
    const etag = head.headers.get("etag") ?? "";
    return head.ok && etag !== "" && !STAND_INS.some((s) => etag.includes(s)) ? url : null;
  } catch {
    return null;
  }
}

// ── Logos that are really there ───────────────────────────────────────────────

/**
 * What Scrydex answers for a set whose logo it does not have: a 200 with the generic Pokémon Trading
 * Card Game wordmark, the same file for every such set. 29 of the 165 Japanese logos first copied on
 * 2026-09-14 were this file (ADV, e-Card, neo, PCG, PMCG, CP6), and every one of those sets drew the
 * same logo.
 */
const LOGO_STAND_IN = "cf-lVkzmA0aekAMPnwN5JhK5nygITfWme2fetQNLVvDQ";

/** A Scrydex logo address where Scrydex has a real logo behind it; null for its stand-in or no answer. */
export async function scrydexRealLogo(address: string | null): Promise<string | null> {
  if (!address) return null;
  try {
    const head = await fetch(address, {
      method: "HEAD",
      cache: "no-store",
      signal: catalogueTimeout(),
    });
    const etag = head.headers.get("etag") ?? "";
    return head.ok && etag !== "" && !etag.includes(LOGO_STAND_IN) ? address : null;
  } catch {
    return null;
  }
}

/**
 * Scrydex's code for the English sets TCGdex publishes no logo for, read by hand on 2026-09-14: the
 * trainer kits (whose logo is the kit line's wordmark), the McDonald's collections, the Poké Card
 * Creator Pack and the Mega Evolution Energy.
 */
const ENGLISH_LOGO_CODES: Record<string, string> = {
  "tk-dp-m": "tk3a",
  "tk-dp-l": "tk3b",
  "tk-hs-r": "tk4a",
  "tk-hs-g": "tk4b",
  "tk-bw-z": "tk5a",
  "tk-bw-e": "tk5b",
  "tk-xy-sy": "tk6a",
  "tk-xy-n": "tk6b",
  "tk-xy-w": "tk7a",
  "tk-xy-b": "tk7b",
  "tk-xy-latio": "tk8a",
  "tk-xy-latia": "tk8b",
  "tk-xy-su": "tk9a",
  "tk-xy-p": "tk9b",
  "tk-sm-l": "tk10a",
  "tk-sm-r": "tk10b",
  "2023sv": "mcd23",
  "2024sv": "mcd24",
  "ex5.5": "wb1",
  mee: "mee",
};

/** Scrydex's logo for an English set TCGdex has none for, where Scrydex has a real one. */
export const scrydexEnglishLogo = (setId: string): Promise<string | null> => {
  const code = ENGLISH_LOGO_CODES[setId];
  return scrydexRealLogo(code ? `https://images.scrydex.com/pokemon/${code}-logo/logo` : null);
};
