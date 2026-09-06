/**
 * What a card is worth, out of what Cardmarket publishes about it.
 *
 * Plain JavaScript rather than TypeScript, and that is the whole reason this
 * file exists apart from lib/cards.ts. scripts/snapshot-collection-value.mjs
 * has to put the same number on a card as the site does, or the figure on the
 * home page's chart would disagree with the one on /cards, and the repo runs on
 * Node 20, which cannot import a .ts file. Duplicating the bands into the script
 * would have made a measurement into two measurements, and the comment on
 * NM_BANDS below is explicit that they are not to be changed without new
 * readings: the surest way to break that is to have two copies of them.
 *
 * Moved here wholesale from lib/cards.ts, comments and constants unchanged.
 * lib/cards-price.test.ts covers it and did not need a line changed either.
 */

/**
 * @typedef {object} Price
 * @property {number | null} low
 *   Cardmarket's lowest listing at any condition in any language. A floor, not a price.
 * @property {number | null} market
 *   What one copy trades at: the trend, or the month's average where trend is broken.
 * @property {number | null} avg30
 *   The month's average, which is both the check on the trend and what replaces it.
 * @property {{ low: number, mid: number, high: number } | null} nm
 *   Estimated English Near Mint asking range. Null where it cannot honestly be said.
 *
 *   `mid` is the middle of it, and it is the number the grid and the totals use,
 *   because a range does not fit on a tile and does not add up. Against the
 *   seven cards the bounds were calibrated on it lands within 8.7%, median 6.1%.
 */

/**
 * The one number a card is shown at, ranked by and totalled on.
 *
 * Cardmarket's own trend (the month's average where the trend has run off;
 * marketPrice() below), the number Cardmarket itself heads a product with. It
 * used to be the middle of the Near Mint range above, an estimate of an asking
 * price; on dear cards that ran a fifth above what a person sees on the site
 * (SVP 085 Pikachu: €999 shown, trend €831), so the estimate stays in the
 * payload as `nm` for anyone who wants a range and the headline is the trend.
 * Where Cardmarket has published no trend and no month's average, only its
 * lowest listing, that floor is the number:
 * a card shown at its cheapest listing is nearer the truth than a card shown
 * as worth nothing, which is what thirty-odd new promos read as. Everything
 * that puts a figure on a card goes through here, so the grid, the dashboard
 * total, the sort order and the home page's chart cannot disagree about what
 * a card is worth.
 *
 * @param {Price | null | undefined} p
 * @returns {number | null}
 */
export const shownPrice = (p) => (p ? (p.market ?? p.nm?.mid ?? p.low) : null);

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export const num = (v) => (typeof v === "number" ? v : null);

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

/**
 * What an English Near Mint copy is listed at, as a range around the market price.
 *
 * Cardmarket's own API would answer this directly, with `minCondition` and
 * `idLanguage`, but it has been closed to new applications and the product page
 * meets a scripted request with a Cloudflare challenge. So the ratio is
 * calibrated instead, against thirteen cards read off Cardmarket by hand with
 * both filters set.
 *
 * It is not one number. Dear cards list above the blended trend, because the
 * English Near Mint copy is the scarce one; mid-priced cards list below it,
 * because there are enough about to undercut. Nine sound cards fell into two
 * groups that do not overlap:
 *
 *   over €20    1.17  1.20  1.29  1.38
 *   €5 to €20   0.81  0.86  0.91
 *
 * The bounds below are those groups with a little air, and all seven cards that
 * get a range land inside their own. Under €5 there is deliberately no range:
 * the two cards measured there came out at 0.52 and 1.17, and the cheapest
 * listing at that price is usually a lot rather than a single, so there is
 * nothing there to be accurate about.
 *
 * Two things this does not know, both deliberate rather than overlooked.
 *
 * The €20 boundary is soft. The measurements place it only somewhere between
 * €13 and €39, and 229 of this collection's cards sit inside that gap, so a
 * range near the boundary is the roughest of them.
 *
 * And every card measured was modern: the dearest is a 2026 set and the oldest
 * above €5 is Silver Tempest. Vintage is likely to sit higher against its trend
 * than these bounds allow, because a Base Set trend is dragged down by played
 * copies while the Near Mint one is the scarce thing on the page, so a vintage
 * holo is probably being understated here. That is a known gap, not a claim
 * that the ratio holds: it wants its own band, fitted on vintage cards checked
 * by hand above €5, and until those exist do not guess at one.
 *
 * Either way, do not narrow these bounds without new measurements. The
 * confidence would be invented rather than measured.
 */
const NM_BANDS = [
  { over: 20, low: 1.15, high: 1.4 },
  { over: 5, low: 0.78, high: 0.95 },
];

/**
 * @param {number | null} market
 * @returns {{ low: number, mid: number, high: number } | null}
 */
function nmRange(market) {
  if (market == null) return null;
  const band = NM_BANDS.find((b) => market >= b.over);
  if (!band) return null;
  const low = market * band.low;
  const high = market * band.high;
  return { low, mid: (low + high) / 2, high };
}

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
  return { low, market, avg30, nm: nmRange(market) };
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
  return { low, market, avg30, nm: nmRange(market) };
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
 * One price out of the two markets: the average of Cardmarket's shown figure and TCGplayer's
 * market in euros, where both exist; whichever exists where one does not. The low is the
 * lower of the two floors. Cardmarket's month's average rides along for the trend check that
 * already happened; no Near Mint band, since the band was calibrated on Cardmarket alone and
 * the blend already is the shown figure. Null only where neither market has a number.
 *
 * @param {Price | null} cardmarket
 * @param {Price | null} tcgplayer already in euros, from priceFromUsd()
 * @returns {Price | null}
 */
export function blendPrices(cardmarket, tcgplayer) {
  const a = shownPrice(cardmarket);
  const b = tcgplayer ? tcgplayer.market : null;
  if (a === null && b === null) return null;
  // One market alone keeps its own shape: Cardmarket's with its band, TCGplayer's as converted.
  if (b === null) return cardmarket;
  if (a === null) return tcgplayer;
  const market = a !== null && b !== null ? Math.round(((a + b) / 2) * 100) / 100 : (a ?? b);
  const lows = [cardmarket?.low, tcgplayer?.low].filter((v) => typeof v === "number");
  const low = lows.length ? Math.min(...lows) : null;
  return { low, market, avg30: cardmarket?.avg30 ?? null, nm: null };
}
