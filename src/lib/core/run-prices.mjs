/**
 * A 1st Edition priced below its own Unlimited, in the same finish: a figure not to be believed.
 *
 * The first print run of a Wizards card is the scarce one and never trades under the reprint of the
 * same card in the same finish. When TCGplayer's figures say it does, one of the two is filed on the
 * wrong product, or a stray sale stuck: Team Rocket's Dark Charizard (base5-4) read its 1st Edition
 * holo at EUR 106 beside an Unlimited holo at EUR 335 from 2026-09-21 on, after falling from EUR 232
 * in a day and staying there. The stray rule (price-months.mjs) cannot see that: it weighs a figure
 * against its own line, and this line fell once and held. Only its twin says it is wrong.
 *
 * Two readers, one rule. The market movers leave such a 1st Edition out (market-movers.ts), and the
 * morning check (scripts/data-health.mjs) lists every card whose stored figures break it.
 *
 * Plain JavaScript, because the script runs on plain node and cannot import TypeScript.
 */

const FIRST_EDITION = /^1st-edition/;

/**
 * How far under its Unlimited a 1st Edition must read before it is disbelieved: below four fifths.
 * A few cents under, on a common or an energy that trades once a week, is a thin market and not a
 * wrong product (eight such on 2026-09-28, a cent or a euro apart); the owner wants the mislinks,
 * which read a third or a half of their twin (Dark Charizard EUR 107 beside 335).
 */
export const INVERTED_RATIO = 0.8;

/**
 * The Unlimited printing a 1st Edition printing is the first run of, by TCGplayer's names:
 * "1st-edition-holofoil" to "unlimited-holofoil", "1st-edition" to "unlimited". Null for any other
 * printing, a Shadowless run included: Shadowless sits between the two and is not the pair.
 *
 * @param {string} printing
 * @returns {string | null}
 */
export const unlimitedTwinOf = (printing) =>
  FIRST_EDITION.test(printing) ? printing.replace(FIRST_EDITION, "unlimited") : null;

/**
 * The 1st Edition printings in one day's figures that read well below their Unlimited twin (under
 * INVERTED_RATIO of it). A printing
 * whose twin has no figure that day is not judged: there is nothing to hold it against.
 *
 * @param {Record<string, number | null | undefined> | null | undefined} printings one day, any unit
 * @returns {string[]}
 */
export function invertedRunPrintings(printings) {
  const out = [];
  for (const [printing, figure] of Object.entries(printings ?? {})) {
    const twin = unlimitedTwinOf(printing);
    const unlimited = twin ? printings?.[twin] : null;
    if (typeof figure === "number" && typeof unlimited === "number" && figure < unlimited * INVERTED_RATIO)
      out.push(printing);
  }
  return out;
}
