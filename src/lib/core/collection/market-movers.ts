/**
 * Which cards moved most across the whole catalogue, not anybody's collection.
 *
 * Home shows it to a visitor with no account, in the place a signed-in reader sees the movers of
 * their own cards (moversOf): real prices where there would otherwise be a blank. Nothing in it is
 * anybody's, so it is the same for every reader.
 *
 * Pure, as moversOf is, and for the same reason: the arithmetic is the part worth testing. The
 * reads around it (getMarketMovers in collection.ts) narrow the catalogue to a few hundred
 * candidates in Postgres (market_mover_candidates) and lay their lines out through the reader every
 * chart uses, so a figure one odd sale set is held over before it gets here.
 */
import { headlineChanges } from "./headline-printing";
import { splitByMove, type CardPricePoint } from "./movers";

/**
 * The price, in cents, a printing has to be at on both ends of the window to be a market mover.
 *
 * The stray rule (dropStrayFigures in price-months.mjs) does not judge a line whose median sits
 * under 25 cents, because at that level five times is TCGplayer's own rounding. So a four-cent card
 * that one trade sent to two euros is exactly the figure it cannot see, and ranked by euros it would
 * top a quiet week. A euro at both ends keeps pennies out of the list, and costs only the moves into
 * or out of penny territory, which are not the story Home tells. The same number narrows the
 * candidates in the migration (20260923120000), so the two cannot disagree.
 */
export const MARKET_MOVER_FLOOR_CENTS = 100;

/** A printing the store named as a candidate: the card and TCGplayer's name for the printing. */
export type MarketCandidate = { tcgId: string; printing: string };

/** What one printing's price did over the window, for one copy. Euros. */
export type MarketMove = {
  tcgId: string;
  /** TCGplayer's printing, as card_price_months names it ("1st-edition-holofoil"). */
  printing: string;
  /** One copy at its first reading in the window. */
  was: number;
  /** And at its last. */
  now: number;
  /** now − was. */
  change: number;
  /** The same as a fraction of `was`. */
  pct: number;
  from: string;
  to: string;
};

export type MarketMoversOptions = {
  /** The window's first and last day, yyyy-mm-dd. */
  from: string;
  to: string;
  /** How many each way. */
  top?: number;
  /** The smallest change worth reporting, euros per copy: moversOf's ten cents, for its reason. */
  minChange?: number;
};

/**
 * Risers and fallers among the candidates, over the window, from lines already read.
 *
 * Each printing is compared between its first and last reading in the window, as moversOf compares
 * a card and a set page compares a tile (headlineChanges, which this reads with). A printing with
 * fewer than two readings in the window is not a mover. Ranked by the euros one copy moved, never by
 * percentage, through the ranking the collection's movers use (splitByMove): a common that doubled
 * is a bigger number and a smaller event than a Charizard that gained eight euros. Where a
 * collection weighs a move by the copies held, the market has none, so one copy is the measure.
 */
export function marketMoversOf(
  candidates: MarketCandidate[],
  points: readonly CardPricePoint[],
  { from, to, top = 10, minChange = 0.1 }: MarketMoversOptions,
): { up: MarketMove[]; down: MarketMove[] } {
  const keyOf = (c: MarketCandidate) => `${c.tcgId}|${c.printing}`;
  const changes = headlineChanges(
    candidates.map((c) => ({ id: keyOf(c), tcgId: c.tcgId, language: "en", series: c.printing })),
    points,
    from,
    to,
  );
  const floor = MARKET_MOVER_FLOOR_CENTS / 100;
  const moves: MarketMove[] = [];
  for (const c of candidates) {
    const m = changes.get(keyOf(c));
    /* The floor again, on the figures as the lines hold them: the store narrowed on what TCGplayer
       sent, and a stray figure held over can bring a printing under it. */
    if (!m || m.was < floor || m.now < floor || Math.abs(m.change) < minChange) continue;
    moves.push({
      tcgId: c.tcgId,
      printing: c.printing,
      was: m.was,
      now: m.now,
      change: m.change,
      pct: m.change / m.was,
      from: m.from,
      to: m.to,
    });
  }
  return splitByMove(moves, (m) => m.change, top);
}
