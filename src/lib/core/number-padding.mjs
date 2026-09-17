/**
 * Whether a set's cards print their number with leading zeros ("001/202") or without ("1/102"), and
 * whether the copy spells it that way, apart from the fetching, so a test can hold it
 * (number-padding.test.ts), the weekly run can write it (scripts/number-padding.mjs) and
 * scripts/data-health.mjs can check it.
 *
 * The copy pads a number where the set is in THREE_DIGIT_SETS (card-number.mjs) or TCGdex pads it
 * itself (every set from Brilliant Stars on). That list was read off Bulbapedia by hand on
 * 2026-09-15, and Bulbapedia refuses GitHub's runners, so a set published after that day was never
 * looked at. Sources compared on 2026-09-17, one card numbered below ten per English set, against
 * the copy as the Bulbapedia pass left it:
 *
 * - Scrydex's card page carries `printed_number` as data ("001/202", "1/102"): 0 disagreements on
 *   the 154 sets it answered. It answers GitHub's runners.
 * - TCGplayer's product "Number" (tcgcsv extendedData): 40 of 182 sets otherwise. It pads the Wizards
 *   era, the POP Series and the McDonald's collections, which print bare numbers (Base Set Alakazam
 *   is "001/102" there; the card prints 1/102).
 * - TCGdex: bare before Brilliant Stars whatever the card prints (Sword & Shield's 001/202 is "1"),
 *   which is the slip this is about. Limitless and Scrydex's set pages write "#1" for every set.
 *   pokemon.com's card database sits behind bot protection.
 *
 * So Scrydex decides, TCGplayer is read beside it, and data-health reports where the two disagree
 * rather than picking one silently.
 *
 * Plain JavaScript, because the scripts run on plain node and cannot import TypeScript.
 */

/**
 * The printed number Scrydex's card page carries, or null.
 *
 * @param {string} html
 * @returns {string | null}
 */
export function scrydexPrintedNumber(html) {
  const m = /&quot;printed_number&quot;:&quot;([^&]*)&quot;/.exec(html ?? "");
  return m?.[1]?.trim() || null;
}

/**
 * Whether a printed number is written with leading zeros: "001/202" and "001" are, "1/102" and "4"
 * are not. Null where the number has no plain digits to pad ("SWSH001", "TG01/TG30", "?").
 *
 * @param {string | null | undefined} printed
 * @returns {boolean | null}
 */
export function printsPadded(printed) {
  const numerator = String(printed ?? "")
    .split("/")[0]
    .trim();
  if (!/^\d+$/.test(numerator)) return null;
  return numerator.length > 1 && numerator.startsWith("0");
}

/**
 * The card a set is judged by: its lowest plain number below ten, as the copy spells it.
 *
 * @param {{ id: string, number: string }[]} cards the set's cards, the copy's spelling
 * @returns {{ id: string, number: string } | null}
 */
export function paddingWitness(cards) {
  return (
    cards
      .filter((c) => /^\d+$/.test(c.number) && Number(c.number) < 10)
      .sort((a, b) => Number(a.number) - Number(b.number))[0] ?? null
  );
}

/**
 * Each set whose stored spelling is not what the card prints, and each set the weekly file has no
 * reading for, and where Scrydex and TCGplayer disagree with each other.
 *
 * @param {{ id: string, number: string, classic?: boolean }[]} witnesses one card per set, from the copy
 * @param {Record<string, { card: string, scrydex: string | null, tcgplayer: string | null }>} readings
 *   number-padding.generated.json, by set id
 * @returns {{ wrong: string[], unread: string[], disputed: string[] }}
 */
export function paddingReport(witnesses, readings) {
  const wrong = [];
  const unread = [];
  const disputed = [];
  for (const w of witnesses) {
    // A Classic Collection prints another card's number, which its label shows instead.
    if (w.classic) continue;
    const setId = w.id.slice(0, w.id.lastIndexOf("-"));
    const reading = readings[setId];
    const scrydex = printsPadded(reading?.scrydex);
    const tcgplayer = printsPadded(reading?.tcgplayer);
    if (scrydex == null && tcgplayer == null) {
      unread.push(setId);
      continue;
    }
    if (scrydex != null && tcgplayer != null && scrydex !== tcgplayer) disputed.push(setId);
    const printed = scrydex ?? tcgplayer;
    const stored = w.number.length > 1 && w.number.startsWith("0");
    // Only Scrydex's word fails a set: TCGplayer alone is a witness that is wrong on vintage sets.
    if (scrydex != null && stored !== printed) wrong.push(setId);
  }
  return { wrong, unread, disputed };
}
