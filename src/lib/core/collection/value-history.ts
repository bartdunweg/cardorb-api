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

/**
 * The first day of the line. tcgcsv's archive starts on 2024-02-08, and since 2026-09-13 the held
 * cards have a reading for every day from it (backfill-card-prices.mjs `--only daily`, every English card, a month to a row), where
 * before they had Saturdays until the cron began (Bart: "ik wil alles per dag, en het liefst zo ver
 * mogelijk terug"). Earlier than this only older sets have a price, about half of a 2023 collection.
 */
export const HISTORY_FROM = "2024-02-08";

/** The first night the cron priced the held cards itself. */
export const HISTORY_DAILY_FROM = "2026-08-16";

/**
 * Whether an account's history has never been built.
 *
 * An account with no point before the cron began, whose collection held a copy before then, has
 * never been built. Once built, the cron leaves the history to its nightly point: every day since
 * 2024 is a million and a half readings for a collection of sixteen hundred cards, which does not
 * fit in the cron's minute, so `?history=1` is for a local run of the route. It used to also
 * rebuild a history with a weekday before the nightly series, which was how the Cardmarket-era
 * points were told apart; a history built from daily readings has weekdays everywhere. A copy with
 * no recorded date counts as held all along, as it does in the line.
 */
export function needsHistoryRebuild(
  snapshotDates: string[],
  items: { owned: boolean; acquiredAt: string | null }[],
): boolean {
  if (snapshotDates.some((d) => d < HISTORY_DAILY_FROM)) return false;
  return items.some(
    (it) => it.owned && (!it.acquiredAt || it.acquiredAt.slice(0, 10) < HISTORY_DAILY_FROM),
  );
}
