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
 * @property {number | null} market
 *   What one copy trades at: TCGplayer's market figure for the printing, in euros.
 */

/**
 * The one number a card is shown at, ranked by and totalled on: TCGplayer's market figure.
 *
 * Null is a real answer and every screen says so out loud, rather than reaching for a
 * second market that prices a different card. Everything that puts a figure on a card
 * goes through here, so the grid, the dashboard total, the sort order and the home
 * page's chart cannot disagree about what a card is worth.
 *
 * @param {Price | null | undefined} p
 * @returns {number | null}
 */
// `?? null` at the end rather than for tidiness: undefined reaching the money formatters is a
// crash, not a missing price.
export const shownPrice = (p) => (p ? (p.market ?? null) : null);

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
 * holo-only card Cardmarket's `-holo` fields described a different, thinner market at 0.47x
 * the plain price, and printingKeysOf() below keeps a holo off the reverse's figure for the
 * same reason.
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
  // "shadowless" is not TCGplayer's word: it files the run as a group of its own, and
  // tcgplayer-links.mjs names that group's printings "shadowless" and "shadowless-holofoil" so a
  // Shadowless copy can ask for them here like any other run.
  const run =
    copy.edition === "1st-edition"
      ? "1st-edition"
      : copy.edition === "shadowless"
        ? "shadowless"
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
 *
 * Cardmarket's own readers went with it on 2026-09-14, and so did TCGplayer's lowest listing:
 * a price here is TCGplayer's market figure and nothing else (Bart's call).
 */

/**
 * A price out of TCGplayer's dollars: the market figure converted at the day's rate, to the
 * cent, since a converted figure otherwise carries a tail no shop would print. Null where
 * TCGplayer publishes no market figure.
 *
 * @param {{ market: number | null }} usd
 * @param {number} rate euros per dollar
 * @returns {Price | null}
 */
export function priceFromUsd(usd, rate) {
  const market = num(usd.market);
  if (market === null) return null;
  return { market: Math.round(market * rate * 100) / 100 };
}

/**
 * One price history point out of TCGplayer's printings, as tcgcsv names them, in the currency
 * they were published in.
 *
 * Two series, because that is what the chart draws: `market` the plain printing, `holo` the
 * foil. Each takes the first of TCGplayer's names that means it, in the order the nightly point
 * reads the same printings off a card (cardPricesFromSets): the ordinary run before the stamped
 * one, the holo before the reverse. A card that exists only as a holo is its holo on both lines.
 *
 * Here rather than beside the cron, for the reason at the top of this file: the script that
 * rebuilds the history runs on plain node, and a rule kept in a .ts file gets copied by hand.
 *
 * @param {Map<string, number> | null | undefined} printings subtype name to market figure
 * @returns {{ market: number, holo: number | null } | null}
 */
export function pointFromTcgplayer(printings) {
  if (!printings) return null;
  const first = (...names) => {
    for (const name of names) {
      const v = printings.get(name);
      if (typeof v === "number" && v > 0) return v;
    }
    return null;
  };
  const plain = first("Normal", "Unlimited", "1st Edition");
  const foil = first("Holofoil", "Unlimited Holofoil", "Reverse Holofoil", "1st Edition Holofoil");
  const market = plain ?? foil;
  return market == null ? null : { market, holo: foil };
}
