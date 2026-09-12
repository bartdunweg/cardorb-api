/**
 * What a card is worth, out of what TCGplayer publishes about it.
 *
 * Plain JavaScript rather than TypeScript, and that is the whole reason this
 * file exists apart from lib/cards.ts. scripts/snapshot-collection-value.mjs
 * has to put the same number on a card as the site does, or the figure on the
 * home page's chart would disagree with the one on /cards, and the repo runs on
 * Node 20, which cannot import a .ts file. One money rule, in one place, is the
 * whole reason: two copies of it is one rule and one drift.
 *
 * Moved here wholesale from lib/cards.ts, comments and constants unchanged.
 * lib/cards-price.test.ts covers it and did not need a line changed either.
 */

/**
 * @typedef {object} Price
 * @property {number | null} low
 *   The lowest listing for the printing. A floor, not a price.
 * @property {number | null} market
 *   What one copy trades at: TCGplayer's market figure for the printing, in euros.
 * @property {number | null} avg30
 *   The month's average, where a source publishes one. TCGplayer does not, so this is
 *   null on every card the app prices today. Kept because the guide readers still fill
 *   it and the price history written before 2026-09-12 carries it.
 * @property {{ low: number, mid: number, high: number } | null} nm
 *   Always null since 2026-09-12. See the note where the Near Mint band used to be.
 */

/**
 * The one number a card is shown at, ranked by and totalled on.
 *
 * The market figure, and the lowest listing where there is no market figure: a card
 * shown at its cheapest listing is nearer the truth than a card shown as worth nothing.
 *
 * Null is a real answer and every screen says so out loud, rather than reaching for a
 * second market that prices a different card. Everything that puts a figure on a card
 * goes through here, so the grid, the dashboard total, the sort order and the home
 * page's chart cannot disagree about what a card is worth.
 *
 * @param {Price | null | undefined} p
 * @returns {number | null}
 */
// `?? null` at the end rather than for tidiness: a Price built without a `low` at all used to
// be caught by the band above it, and undefined reaching the money formatters is a crash, not
// a missing price.
export const shownPrice = (p) => (p ? (p.market ?? p.low ?? null) : null);

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export const num = (v) => (typeof v === "number" ? v : null);

/**
 * Which copies read the foil price series rather than the plain one.
 *
 * The reverse holo, and the Poké Ball and Master Ball printings of 151 and Prismatic
 * Evolutions, which are a reverse holo with a pattern on it. Never the plain holo: on a
 * holo-only card the `-holo` fields describe a different, thinner market at 0.47x the plain
 * price. holoPriceOf() below is what those fields are.
 *
 * It lives here rather than beside FINISHES in collection/collection-row.ts, which now
 * re-exports it, for the reason at the top of this file: the script that values a binder
 * runs on plain node and cannot import a .ts file, so a rule kept over there gets copied
 * over here by hand. It was. scripts/snapshot-collection-value.mjs carried its own
 * `finish === "reverse-holo"`, so it valued a Poké Ball copy at the plain price while every
 * other valuation path valued it at the foil one — and where Cardmarket publishes a foil
 * figure at all, the foil runs at a median of twice the normal printing. Two definitions of
 * a money rule is one definition and one drift.
 *
 * @param {string | null | undefined} f
 * @returns {boolean}
 */
export const isReverseFinish = (f) =>
  f === "reverse-holo" || f === "poke-ball" || f === "master-ball";

/**
 * Which of a card's price series one copy reads.
 *
 * The one sentence, in one place, and that is the point. It was written out four times over:
 * variantPrice() in collection/cards.ts, copyPrice() in collection/items.ts, and twice in
 * collection/snapshot.ts, each a copy of "a reverse reads the foil fields". Four copies of a
 * money rule is one rule and three drifts waiting, which is what happened to isReverseFinish()
 * above before it moved here. An edition would have made it five.
 *
 * The order is deliberate. TCGplayer's own printings come first, because that is the market
 * that tells a holo from the plain card and a stamped run from an unlimited one. Then the
 * stamped run's separate figure where the printings did not carry one, then the card's
 * ordinary price. A copy of a card TCGplayer does not price has no price at all.
 *
 * The Shadowless run lost its figure with Cardmarket on 2026-09-12: it was the one run
 * Cardmarket filed as a product of its own (base1-4 Charizard: €3,567 against €583, read that
 * day) and TCGplayer does not separate it. A Shadowless copy now reads the ordinary price,
 * which understates it. That is a known gap with a source behind it, not an oversight: it
 * wants TCGplayer's own Shadowless products, which live in tcgcsv's archive rather than in
 * what TCGdex relays.
 *
 * @param {{ finish?: string | null, edition?: string | null }} copy
 * @param {{ price?: Price | null, priceFirstEd?: Price | null, pricePrintings?: Record<string, Price | null> | null }} card
 * @returns {Price | null}
 */
/**
 * Which of TCGplayer's printings this copy is, in the order one is taken.
 *
 * TCGplayer names a printing by its foil and its run: "holofoil", "reverse-holofoil",
 * "1st-edition-holofoil", "unlimited". Which of them a copy is, is the same question `finish`
 * and `edition` already answer, so it is answered here rather than guessed by taking whichever
 * printing came first in the record — which handed a Jungle Scyther holo the plain rare's $17.
 *
 * A list rather than one name: a card priced as "holofoil" and nothing else is still the holo
 * copy's price, and a run TCGplayer does not price falls back to the same card without the run.
 *
 * @param {{ finish?: string | null, edition?: string | null }} copy
 * @returns {string[]}
 */
export const printingKeysOf = (copy) => {
  const foil = isReverseFinish(copy.finish)
    ? "reverse-holofoil"
    : copy.finish === "holo"
      ? "holofoil"
      : copy.finish === "normal"
        ? "normal"
        : null;
  const run =
    copy.edition === "1st-edition"
      ? "1st-edition"
      : copy.edition === "shadowless"
        ? null
        : "unlimited";
  const keys = [];
  // The run and the foil together first, then the run, then the foil, then the plain card: every
  // step drops the fact TCGplayer is least likely to price apart.
  if (run && foil) keys.push(`${run}-${foil}`);
  if (run) keys.push(run);
  if (foil) keys.push(foil);
  /*
   * Then the nearest other figure, and only in one direction.
   *
   * A reverse on a card TCGplayer prices only as "holofoil" is still a foil, so it reads that.
   * A holo never reads a reverse: on an older card the holo rare and the reverse are different
   * markets, and treating a holo like a reverse was measured once already, dropping this
   * collection by €2,488 (cards-stats.test.ts). And a copy whose finish nobody has said never
   * reads a foil ahead of the plain card: that is most rows, and reading the reverse's figure
   * for them counted every unclassified modern common at several times its price. The plain
   * card first for those, then "holofoil" for a card that exists only as a holo, where the
   * plain card is the holo.
   */
  if (foil === "reverse-holofoil") keys.push("holofoil");
  keys.push("normal");
  if (foil === null) keys.push("holofoil");
  return [...new Set(keys)];
};

/**
 * What this copy is worth out of the printings TCGplayer prices, where the card carries them.
 *
 * @param {{ finish?: string | null, edition?: string | null }} copy
 * @param {Record<string, Price | null | undefined> | null | undefined} printings
 * @returns {Price | null}
 */
export const printingPriceOf = (copy, printings) => {
  if (!printings) return null;
  for (const key of printingKeysOf(copy)) if (printings[key]) return printings[key];
  return null;
};

export const copyPriceOf = (copy, card) =>
  /*
   * TCGplayer's own printing first, then the stamped run, then the card's own figure, which
   * is TCGplayer's too. One market, all the way down (Bart's call, 2026-09-12).
   *
   * Cardmarket used to answer where TCGplayer says nothing. It no longer does, and that is
   * the point rather than an oversight: it names a product after the card and never after
   * its number, so several printings share one figure and a plain rare reads the holo's
   * price. A copy TCGplayer does not price now has no price, and every screen says so.
   *
   * What that costs is on the record in cardorb-web's docs/prices.md: about one card in
   * eight, mostly promos, and the Shadowless run, which Cardmarket filed as a product of
   * its own and TCGplayer does not separate.
   */
  printingPriceOf(copy, card.pricePrintings) ||
  (copy.edition === "1st-edition" && card.priceFirstEd) ||
  card.price ||
  null;

/**
 * How far trend may run ahead of the month's average before it is disbelieved.
 *
 * Cardmarket's trend is drawn from recent sales and a single absurd one drags it
 * off the map. SVP 159 Magneton reads a trend of €801 against a 30-day average
 * of €391, off the back of one €10,000 sale visible as a spike in its own chart,
 * while the card is actually listed at €70. The same shape catches a product
 * page that mixes printings: e-Card Machamp reads €146 against €79 because
 * Cardmarket files the reverse holo under the same product.
 *
 * Of thirteen cards read off Cardmarket by hand, the two broken ones scored 2.05
 * and 1.84 on this ratio and no sound card went past 1.40, so the line sits
 * between them. It fires on 40 of this collection's 1,211 priced cards.
 */
const TREND_CEILING = 1.5;

/**
 * @param {number | null} trend
 * @param {number | null} avg30
 * @returns {number | null}
 */
function marketPrice(trend, avg30) {
  if (trend == null) return avg30;
  if (avg30 != null && avg30 > 0 && trend / avg30 > TREND_CEILING) return avg30;
  return trend;
}

/*
 * The estimated Near Mint band used to live here: a ratio of about 1.15 to 1.40 above €20
 * and 0.78 to 0.95 between €5 and €20, calibrated against thirteen of the owner's cards read
 * off Cardmarket by hand.
 *
 * It is gone with the market it was measured on (Bart's call, 2026-09-12). The ratio was
 * fitted to Cardmarket's trend, which is dragged down by played copies, and nothing reads
 * that trend any more. Putting the same band on TCGplayer's market figure would have been
 * confidence carried over from a measurement that was never taken there: TCGplayer's figure
 * is drawn from recent sales of the printing, a different number to start from.
 *
 * Do not bring it back on a hunch. A Near Mint premium over TCGplayer wants its own readings,
 * against TCGplayer, before a single card is shown at one.
 */

/**
 * One Price out of whatever Cardmarket published for a card, or null for nothing at all.
 *
 * Exported for its test rather than for any caller: the constants above are a
 * measurement, and a measurement nobody checks is a number that drifts.
 *
 * @param {{ low?: number | null, trend?: number | null, avg30?: number | null }} cm
 * @returns {Price | null}
 */
export function priceOf(cm) {
  const low = num(cm.low);
  const avg30 = num(cm.avg30);
  const market = marketPrice(num(cm.trend), avg30);
  // A card TCGdex knows but has never seen listed has every one of them null,
  // which is not the same as "free" and should not be shown as a price.
  if (low === null && market === null && avg30 === null) return null;
  return { low, market, avg30, nm: null };
}

/**
 * The same, for the holo printing, which Cardmarket prices separately.
 *
 * Both feeds publish a second set of fields beside the first — `low-holo`,
 * `trend-holo`, `avg30-holo` — and they mean the foil printing of the same
 * product: the reverse holo, and for older sets the holo rare. Cardmarket files
 * both under one idProduct, which is why this is a second price on one card
 * rather than a second card.
 *
 * **Zero is not a price, and this is the whole reason this function exists
 * rather than a caller reading the fields itself.** Of 1,526 products in this
 * collection, 865 answer `trend-holo: 0` — Cardmarket saying it has no foil
 * listing for them, not saying the foil is free. Read naively that turns a
 * reverse holo into a card worth nothing, which is worse than the problem this
 * was built to fix. 660 carry a real figure, and where they do the foil runs at
 * a median of twice the normal printing.
 *
 * Null where there is no separate foil price, so the caller falls back to the
 * normal one — which is the honest answer for a card Cardmarket does not
 * distinguish.
 *
 * Takes the whole record rather than the foil fields alone, because that is how
 * it is called: one guide row, or one TCGdex pricing object, goes to both this
 * and priceOf(). Splitting it at the call site would mean every caller knowing
 * which keys belong to which printing, which is the knowledge this file exists
 * to hold.
 *
 * @param {{ low?: number | null, trend?: number | null, avg30?: number | null,
 *   "low-holo"?: number | null, "trend-holo"?: number | null, "avg30-holo"?: number | null }} cm
 * @returns {Price | null}
 */
export function holoPriceOf(cm) {
  const zeroless = (v) => {
    const n = num(v);
    return n === null || n === 0 ? null : n;
  };
  const low = zeroless(cm["low-holo"]);
  const avg30 = zeroless(cm["avg30-holo"]);
  const market = marketPrice(zeroless(cm["trend-holo"]), avg30);
  if (low === null && market === null && avg30 === null) return null;
  return { low, market, avg30, nm: null };
}

/**
 * A price out of TCGplayer's dollars, for a card Cardmarket publishes nothing for.
 *
 * The market figure converted at the day's rate is the price; the low is kept as the
 * floor it is. No month's average and no Near Mint band: those are Cardmarket's numbers
 * and the band was calibrated on them, so shownPrice() takes the market directly. To the
 * cent, since a converted figure otherwise carries a tail no shop would print.
 *
 * @param {{ market: number | null, low: number | null }} usd
 * @param {number} rate euros per dollar
 * @returns {Price | null}
 */
export function priceFromUsd(usd, rate) {
  const cents = (v) => (v == null ? null : Math.round(v * rate * 100) / 100);
  const market = cents(num(usd.market));
  const low = cents(num(usd.low));
  if (market === null && low === null) return null;
  return { low, market, avg30: null, nm: null };
}

/**
 * The card's price, out of the one market that prices it: TCGplayer's figure in euros, or
 * null.
 *
 * This used to average the two markets, and before that it preferred Cardmarket. Both are
 * gone (Bart's call, 2026-09-12). Averaging a figure that names the printing with one that
 * names only the card does not make either of them truer: it puts half of a holo's price on
 * the plain rare beside it, and the reader cannot see which half. Cardmarket priced a Team
 * Rocket Dark Golbat at €30.46 where TCGplayer said €5.83, off one shared product.
 *
 * So one source answers, and where it says nothing the card has no price. What that costs is
 * on the record in cardorb-web's docs/prices.md: about one card in eight, mostly promos, and
 * the European market the owner would actually sell in.
 *
 * Takes the Cardmarket figure it no longer uses, on purpose. Every caller still has one in
 * hand, and a function that quietly ignores an argument is easier to read than fifteen call
 * sites that stop passing it while the guide behind them is still being unwound (that is the
 * cron's and the guide's own change, not this one).
 *
 * @param {Price | null} _cardmarket no longer read; see above
 * @param {Price | null} tcgplayer already in euros, from priceFromUsd()
 * @returns {Price | null}
 */
export function priceFromMarket(_cardmarket, tcgplayer) {
  if (!tcgplayer) return null;
  return tcgplayer.market === null && tcgplayer.low === null ? null : tcgplayer;
}
