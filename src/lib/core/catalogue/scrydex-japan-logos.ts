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

export type ScrydexExpansion = { name: string; code: string };

/** TCGdex id to Scrydex code, where neither the id nor the title lines up (read by hand 2026-09-14). */
const BY_HAND: Record<string, string> = {
  S5a: "swsh5a_ja", // Matchless Fighters, which Scrydex calls Peerless Fighters
  PMCG2: "base2_ja", // Pokémon Jungle, Scrydex's Jungle
  "SM1+": "sm1p_ja", // Sun & Moon strengthening pack
  "sm2+": "sm2p_ja", // Beyond a New Challenge, Scrydex's Facing a New Trial
  XY11a: "xy11f_ja", // Explosive Fighter, Scrydex's Fever-Burst Fighter
};

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const unescape = (s: string) =>
  s
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

/** Every Japanese expansion Scrydex lists, off its expansions page: name and code. */
export async function scrydexJapanExpansions(): Promise<ScrydexExpansion[]> {
  const res = await fetch("https://scrydex.com/pokemon/jp/expansions", {
    headers: { "User-Agent": "cardorb.com" },
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`Scrydex expansions: ${res.status}`);
  return parseExpansions(await res.text());
}

/** The expansions on Scrydex's page, one per link that names a set. Exported for its test. */
export function parseExpansions(page: string): ScrydexExpansion[] {
  const seen = new Map<string, ScrydexExpansion>();
  for (const m of page.matchAll(
    /data-name="([^"]+)"[^>]*href="\/pokemon\/expansions\/[^"/]+\/([a-z0-9_]+)"/g,
  )) {
    const code = m[2]!;
    if (!seen.has(code)) seen.set(code, { name: unescape(m[1]!), code });
  }
  return [...seen.values()];
}

/** The Scrydex logo address for a TCGdex Japanese set, or null where Scrydex lists no such set. */
export function scrydexLogoFor(
  expansions: ScrydexExpansion[],
  set: { id: string; name: string },
): string | null {
  const byCode = new Map(expansions.map((e) => [e.code, e]));
  const hand = BY_HAND[set.id];
  const code =
    (hand && byCode.has(hand) ? hand : null) ??
    (byCode.has(`${set.id.toLowerCase().replace(/[^a-z0-9]/g, "")}_ja`)
      ? `${set.id.toLowerCase().replace(/[^a-z0-9]/g, "")}_ja`
      : null) ??
    (() => {
      const title = fold(set.name);
      const named = expansions.filter((e) => fold(e.name) === title);
      return named.length === 1 ? named[0]!.code : null;
    })();
  return code ? `https://images.scrydex.com/pokemon/${code}-logo/logo` : null;
}
