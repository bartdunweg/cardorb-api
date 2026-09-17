/**
 * Which print runs TCGdex names a card in, as this app's editions, apart from the rest so the
 * morning check (scripts/data-health.mjs) reads the same rule as the sheet (editionsOf).
 *
 * TCGdex's variants carry a `subtype` on Base Set: "unlimited", "shadowless", "shadowless-red-cheek"
 * (Pikachu 58), "1999-2000-copyright" (source audit, 2026-09-17). An edition is one of four words the
 * iOS app knows, so only the runs that are one are read: Shadowless (red cheeks or not) and Unlimited.
 * The others are named in UNMAPPED_SUBTYPES and reported, never offered.
 *
 * Plain JavaScript, because the script runs on plain node and cannot import TypeScript.
 */

/** TCGdex's run words that are an edition, and the edition. */
const EDITION_OF_SUBTYPE = {
  unlimited: "unlimited",
  shadowless: "shadowless",
  "shadowless-red-cheek": "shadowless",
};

/**
 * The print runs TCGdex names that no edition is: a copyright line, an error print, a border. Reported
 * by data-health, for the owner to decide whether any becomes an edition.
 */
export const UNMAPPED_SUBTYPES = new Set([
  "1999-2000-copyright",
  "1999-copyright",
  "missing-expansion-symbol",
  "gold-border",
  "evolution-box-error",
  "no-holo-error",
  "d-ink-dot-error",
  "shifted-energy-cost",
  "glossy",
  "missing-hp",
  "aoki-error",
]);

/**
 * The editions TCGdex's variants name, in no order, each once.
 *
 * @param {{ subtype?: string | null }[] | null | undefined} variants
 * @returns {string[]}
 */
export function runsOfSubtypes(variants) {
  const out = new Set();
  for (const v of variants ?? []) {
    const edition = EDITION_OF_SUBTYPE[v?.subtype ?? ""];
    if (edition) out.add(edition);
  }
  return [...out];
}
