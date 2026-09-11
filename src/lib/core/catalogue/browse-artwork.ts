/**
 * A second source of scans for a browsed set, where the catalogue has none.
 *
 * This file used to swap TCGdex's WebP in for pokemontcg.io's PNG on the
 * English shelf (7.6× the bytes for the same pixels — see git history for the
 * measurement). That shelf reads TCGdex itself since 2026-09-11 (tcgdex-browse.ts),
 * so every English card arrives with the small scan already; what is left is
 * the Japanese shelf's gap, below.
 */
import { limitlessJapaneseScan, tcgdexScan, tcgdexScanIsReverse } from "./artwork";
import type { CatalogueMatch } from "./ptcg-search";

/**
 * Limitless's scans for a Japanese set TCGdex has not photographed.
 *
 * ── The measurement this exists for ────────────────────────────────────────
 *
 * The Japanese shelf hands out TCGdex's picture address for every card without
 * asking whether a file is behind it, and on 2026-09-11 there was none behind
 * 41 of 72 sampled cards across eight sets — whole sets at a time (SV5M, SM12a,
 * SM1M: 12 of 12), the odd card elsewhere (SV5a: 1 of 12). Traditional Chinese
 * was 44 of 60; English 1 of 96. A set page of grey boxes with names in them.
 *
 * Limitless has the Japanese scans, at an address artwork.ts builds from the
 * set's abbreviation and the number. Japanese only: Limitless carries no
 * Korean or Chinese cards, and those shelves keep what they had.
 *
 * ── Why one probe per set and not one per card ─────────────────────────────
 *
 * The gaps are mostly whole sets, so one HEAD on the first card says which
 * kind of set this is: photographed, and every card keeps TCGdex's smaller
 * file (19 kB against Limitless's 62 kB); or not, and every card gets the
 * guess. The odd missing card in a photographed set stays a gap — that is one
 * in twelve, against 250 HEADs a set to close it, and the page has a better
 * answer for a single gap than a second catalogue. The guess itself is not
 * checked either, for the same reason: the browser finds out, the way it did
 * before this existed, and a 404 there costs exactly what it cost.
 */
export async function withLimitlessScans(
  lang: string,
  cards: CatalogueMatch[],
): Promise<CatalogueMatch[]> {
  if (lang !== "ja" || !cards.length) return cards;
  const guess = (card: CatalogueMatch): CatalogueMatch => {
    const { low, high } = limitlessJapaneseScan(card.id, card.number);
    return { ...card, image: low, imageHigh: high };
  };
  // A card whose record names no picture gets the guess without a probe, as
  // the collection's resolve gives one (tcgdex-language.ts): there is no
  // address to check. The set page never has these — setIn builds every
  // address from the serie — but a search hit reads the record as it is.
  const first = cards.find((c) => c.image)?.image;
  if (!first) return cards.map(guess);
  // A set TCGdex photographed in its reverse variant is swapped without the
  // probe: the file is there, and it is the wrong print (artwork.ts).
  const setId = cards[0]!.id.slice(0, cards[0]!.id.lastIndexOf("-"));
  // The set's own scans exist: keep every card's. tcgdexScan() answers the
  // path itself when the probe cannot be made, which reads as "keep" here —
  // an unanswered check is not a reason to swap a whole set's pictures.
  if (!tcgdexScanIsReverse(setId) && (await tcgdexScan(first.replace(/\/low\.webp$/, ""))))
    return cards.map((card) => (card.image ? card : guess(card)));

  return cards.map(guess);
}

/**
 * The same, for a page of hits from many sets: withLimitlessScans() decides
 * once per set, so the page is grouped by set, decided, and put back in its
 * order. Twenty hits are at most twenty probes cold, each cached a day, and
 * a set already opened on the shelf costs nothing here.
 */
export async function withLimitlessScansPerSet(
  lang: string,
  cards: CatalogueMatch[],
): Promise<CatalogueMatch[]> {
  if (lang !== "ja" || !cards.length) return cards;
  const groups = new Map<string, CatalogueMatch[]>();
  for (const card of cards) {
    const setId = card.id.slice(0, card.id.lastIndexOf("-"));
    groups.set(setId, [...(groups.get(setId) ?? []), card]);
  }
  const decided = new Map<string, CatalogueMatch>();
  await Promise.all(
    [...groups.values()].map(async (group) => {
      for (const card of await withLimitlessScans(lang, group)) decided.set(card.id, card);
    }),
  );
  return cards.map((card) => decided.get(card.id) ?? card);
}
