/**
 * One dated reading of what a collection was worth, and the tag that drops it.
 *
 * Its own file rather than living next to the getter in lib/core/value-history.ts,
 * for the same reason collection-row.ts sits apart from collection.ts: this is
 * the seam the store adapter writes to, and lib/storage/postgres.ts has to name
 * the shape it returns. Putting it in value-history.ts — which imports the
 * storage layer — would make the two files import each other.
 */

/**
 * Whole euros, not cents.
 *
 * The table counts in cents, because the sum behind a reading is built from
 * two-decimal Cardmarket rows and rounding at rest throws that away. It becomes
 * euros at the storage boundary (listValueSnapshots), so this is the only shape
 * the app and the iOS client ever see, and the v1 response shape is unchanged
 * from when the series was a committed JSON file.
 */
export type ValueSnapshot = {
  /** ISO yyyy-mm-dd. Whatever Cardmarket published that morning. */
  date: string;
  value: number;
  /** Copies held by that date, how many carried a price, and how many did not. */
  cards: number;
  priced: number;
  unpriced: number;
  /**
   * Copies added since the point before, and what they were worth on this day. What the line gained
   * by holding more rather than by prices moving, so a chart can mark the day and a total can say
   * which part of a change was which (Bart, 2026-09-13: "ik zie het toevoegen van kaarten niet
   * terug in de grafiek"). Zero on an account's first point, whose copies were not added since
   * anything. Left out by a point written before 2026-09-13, which reads as zero.
   */
  added?: number;
  addedValue?: number;
};

/**
 * Deliberately not cardsTag(userId), and it would be wrong in both directions.
 *
 * Adding a card does not add a reading — the series only moves when the
 * snapshot script runs — so sharing the cards tag would drop a still-correct
 * cache on every edit. And the script writes from plain node, out of band, where
 * revalidateTag does not exist, so it could not drop either tag anyway.
 *
 * That last part was true when it was written and is not any more: the snapshot
 * cron runs as a route handler now, not from plain node, and it revalidates this
 * tag itself — api/v1/cron/snapshot/route.ts, beside the write. So a fresh point
 * reaches the dashboard immediately rather than on the one-hour TTL.
 *
 * The paragraph is kept rather than deleted because it explains why the tag is
 * separate from cardsTag(), which is still the reason it exists. Note that
 * cardPricesTag in ./collection.ts is the one now in the position this used to
 * describe: declared, applied, and dropped by nothing.
 */
export const valueHistoryTag = (userId: string) => `value-history:${userId}`;
