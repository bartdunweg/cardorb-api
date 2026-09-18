import { CARRY_DAYS, holdingsSeries } from "./folder-history";
import type { CardItem } from "./items";
import type { CardPricePoint } from "./movers";
import type { ValueSnapshot } from "./value-snapshot";

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

/** How far back the night reads the held cards' readings: past CARRY_DAYS, and past two Saturdays. */
export const NIGHT_READ_DAYS = 30;

/** How many days before tonight the night writes again, so a late or corrected reading still lands. */
export const NIGHT_WRITE_DAYS = 7;

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The first day of readings the night reads, for the night of `date`. */
export const nightReadFrom = (date: string) => daysBefore(date, NIGHT_READ_DAYS);

/**
 * The points the 04:00 cron stores for the night of `date`: the last NIGHT_WRITE_DAYS before it,
 * built by holdingsSeries, the same sum the recent days of the Home line are (getRecentValue).
 *
 * The cron used to store one point dated tonight from the collection as assembled at 04:00: a day
 * behind the cards' lines and a few cents off. Home shows the recent line over the last ninety days
 * and the stored points before that, so a point stored that way came into view on its ninety-first
 * day as a step the collection never took. Tonight itself has no point: the price job writes its
 * readings at 21:15 UTC, and the next night stores it. `readings` start at nightReadFrom(date), which
 * is far enough back that every point written sums as the whole history would sum that day.
 */
export function nightlyPoints(
  items: CardItem[],
  readings: CardPricePoint[],
  date: string,
): ValueSnapshot[] {
  const from = daysBefore(date, NIGHT_WRITE_DAYS);
  return holdingsSeries(items, readings).filter((p) => p.date >= from && p.date < date);
}

/**
 * How far back the live tail reads, before the first day it answers for.
 *
 * A card with no reading on a day is valued at its last one, up to CARRY_DAYS old (holdingsSeries).
 * A tail that read only the days it answers for would price the collection from whatever happened
 * to have a reading that morning: on 2026-09-13, 184 held promos and gallery cards had none, which
 * is a third of Kanto missing from the line. One day more than CARRY_DAYS is exactly enough, because
 * a reading older than that no longer stands anywhere in the answer.
 */
export const TAIL_READ_DAYS = CARRY_DAYS + 1;

const dayAfter = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const daysBeforeDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The first day of readings the tail reads, for a tail that answers from `since`. */
export const tailReadFrom = (since: string) => daysBeforeDate(since, TAIL_READ_DAYS);

/** The window the line falls back to where nothing is stored: the readings' own ninety days. */
export const HISTORY_WINDOW_DAYS = 90;

/**
 * The first day the Home line has to be worked out rather than read: the earliest day of the window
 * with no stored point, or the day after the last one.
 *
 * The line used to sum every reading of every held card over the last ninety days on every visit,
 * and draw those ninety days over the stored points that already said the same thing: 144,574
 * readings, 1,678 ms to read and 241 ms to add up, measured in production on 2026-09-17. The 04:00
 * cron writes one exact point a night (nightlyPoints), built by the same holdingsSeries over the
 * same readings, so for every night it has written the answer is already in the table.
 *
 * What is left is today, whose readings arrive at 21:15 UTC and whose point the cron stores
 * tomorrow, and any night the cron missed. The *earliest* missing day is taken rather than the
 * latest, so a gap or a stale history is worked out again and drawn, instead of a stored point
 * quietly standing where none belongs. An account with no points at all gets the whole window, as
 * it did before there was anything to read.
 *
 * Null where the window is covered to and including today, which is a day the cron cannot have
 * written yet (nightlyPoints stores `date` exclusive) and so does not happen in practice.
 */
export function recentFrom(
  storedDates: string[],
  today: string,
  windowDays = HISTORY_WINDOW_DAYS,
): string | null {
  const stored = new Set(storedDates);
  const last = storedDates.length ? storedDates[storedDates.length - 1]! : null;
  let day = daysBeforeDate(today, windowDays);
  while (day <= today) {
    if (!stored.has(day)) return day;
    day = dayAfter(day);
  }
  return last ? dayAfter(last) : null;
}
