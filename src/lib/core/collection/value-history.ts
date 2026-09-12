/**
 * Where the Home line's history starts, and when an account's has to be built again.
 *
 * The line is holdingsSeries() (folder-history.ts): what the collection held on the day, at that
 * day's TCGplayer prices. It is stored in collection_value_snapshots, which the Home chart reads,
 * because computing it live is a quarter of a million readings for a collection of sixteen
 * hundred cards: measured at 5 to 11 seconds in the database on 2026-09-12. The nightly cron adds
 * one exact point a night; this is about the past.
 *
 * Until 2026-09-12 the past held what the snapshot had written at the time: Cardmarket's guide,
 * then its Near Mint estimate, then the average of two markets, plus two points valued from
 * archived Cardmarket guides. Those points were built again from the price history, once per
 * account, by the cron (api/v1/cron/snapshot).
 */

/** The first Saturday every card has a TCGplayer reading for: tcgcsv's archive starts 2024-02-08. */
export const HISTORY_FROM = "2024-02-10";

/** The first night the held cards have a reading of their own every day. */
export const HISTORY_DAILY_FROM = "2026-08-16";

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isSaturday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 6;

/** Every Saturday on or after `from` and before `before`. */
export function saturdaysBetween(from: string, before: string): string[] {
  let day = from;
  while (!isSaturday(day)) day = addDays(day, 1);
  const out: string[] = [];
  for (; day < before; day = addDays(day, 7)) out.push(day);
  return out;
}

/**
 * Whether an account's history still holds the old series.
 *
 * A rebuilt history has only Saturdays before the nightly series began, so a weekday there is an
 * old point. An account with no point before then, whose collection held a copy before then, has
 * never been built. Once built, neither is true, and the cron leaves the history to its nightly
 * point. A copy with no recorded date counts as held all along, as it does in the line.
 */
export function needsHistoryRebuild(
  snapshotDates: string[],
  items: { owned: boolean; acquiredAt: string | null }[],
): boolean {
  const before = snapshotDates.filter((d) => d < HISTORY_DAILY_FROM);
  if (before.some((d) => !isSaturday(d))) return true;
  if (before.length) return false;
  return items.some(
    (it) => it.owned && (!it.acquiredAt || it.acquiredAt.slice(0, 10) < HISTORY_DAILY_FROM),
  );
}
