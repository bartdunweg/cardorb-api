import { NextResponse } from "next/server";
import { refuse, apiError } from "@/lib/api/respond";
import { assembleFor, usdToEurForRequest } from "@/lib/core/collection/collection";
import { TCGCSV_CATEGORY, shelfPrices } from "@/lib/core/catalogue/tcgcsv";
import {
  cardPricesFromSets,
  cardPricesFromTcgcsv,
  snapshotFromSets,
} from "@/lib/core/collection/snapshot";
import TCGPLAYER_IDS from "@/lib/core/tcgplayer-ids.generated.json";
import TCGPLAYER_IDS_JA from "@/lib/core/tcgplayer-ids.ja.generated.json";
import { valueHistoryTag } from "@/lib/core/collection/value-snapshot";
import { revalidateTag } from "next/cache";
import {
  listAccountIds,
  listHistoryPrices,
  listRows,
  listValueSnapshots,
  replaceValueHistory,
  writeCardPrices,
  writeValueSnapshot,
} from "@/lib/storage/postgres";
import { holdingsSeries } from "@/lib/core/collection/folder-history";
import { flattenItems } from "@/lib/core/collection/items";
import {
  HISTORY_DAILY_FROM,
  HISTORY_FROM,
  needsHistoryRebuild,
  saturdaysBetween,
} from "@/lib/core/collection/value-history";
import { adminClient } from "@/lib/storage/supabase";

/**
 * One value reading per account, once a night.
 *
 * It was once a week, which is why the chart on the dashboard had four points
 * in it eight months after the table shipped. Nightly is both the ceiling and
 * the right answer, and neither reason is a preference: this is a Vercel Hobby
 * project, where a cron may be triggered at most once a day, and TCGplayer's
 * figures as tcgcsv publishes them are rebuilt once a day too, so running twice
 * would write the same number twice. The past a collection's value cannot be
 * fetched; a card's own past can, and scripts/backfill-card-prices.mjs does.
 *
 * This is the half of per-user value history that was missing. The table it writes to shipped
 * with three points in it, put there by hand, and nothing added a fourth — a
 * chart whose whole premise is "recorded over time" that would have shown the
 * same three readings for the rest of its life. The series cannot be fetched
 * (nobody publishes it), so it has to be recorded, and something has to do the
 * recording on a schedule.
 *
 * ── Why the service role, which the rules say to avoid ─────────────────────
 *
 * Because there is nobody to be. A cron fires at four in the morning with
 * no session attached, and a job that recorded only the collections whose
 * owners happened to be signed in would record almost nothing. That is the
 * exact condition adminClient()'s own comment now names as the second
 * legitimate use: no person exists for this to act as, so a client that cannot
 * represent one is not hiding anything.
 *
 * It is also why the guard below is not optional. Row level security is doing
 * nothing here — this client is past it — so the only thing standing between
 * this route and a stranger writing to everyone's history is CRON_SECRET, and
 * a missing secret is treated as a closed door rather than an open one.
 *
 * ── Each card's own price, the one the app shows ───────────────────────────
 *
 * The night reads the same assembly every request reads, and the warm cron has
 * usually just built it, so what the night writes is what the day shows. Every
 * figure in it is TCGplayer's since 2026-09-12 (price-basis.mjs), and every
 * point says so in card_prices.source, whose default is 'cardmarket'.
 *
 * ── Every other card, once a week ──────────────────────────────────────────
 *
 * A card nobody held had no line at all: its sheet opened on an empty chart.
 * Since 2026-09-11 the night of a Monday also writes a point for every card the
 * id maps know. It read Cardmarket's guide until 2026-09-12 and reads TCGplayer's
 * figures from tcgcsv now, the English and the Japanese shelf: one market for
 * every line. The held cards stay nightly and are written first, so the weekly
 * pass never overwrites a card's own figure. `?all=1` runs that pass on any day,
 * for a week the cron missed. Saturdays, because the 2.8 million weekly points the
 * archive filled since 2024 are Saturdays (scripts/backfill-card-prices.mjs); this
 * said Mondays and ran on Mondays until 2026-09-12, so the two series never met.
 */

export const dynamic = "force-dynamic";
/**
 * One assembly per account, memoised for ten minutes and mostly warm. Sixty
 * seconds is the ceiling this plan allows, and the work is ordered so that a
 * timeout loses the accounts not yet reached rather than corrupting the ones
 * already written: each is committed as it finishes.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  // Fails closed. A deployment that has not set the secret does not get an
  // unauthenticated write endpoint as a consolation prize.
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set: refusing to run the snapshot");
    return apiError(503, "Not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "No.");
  }

  const db = adminClient();
  if (!db) return refuse("noDatabase");

  // Dated by the night it runs, in UTC, and the per-card readings share the date so a folder's line and the collection's agree on the day.
  const date = new Date().toISOString().slice(0, 10);
  const written: { user: string; value: number; cards: number }[] = [];
  /** Accounts whose Home line was built again from the price history this run (value-history.ts). */
  const rebuilt: { user: string; points: number }[] = [];
  const forceHistory = new URL(req.url).searchParams.get("history") === "1";
  const failed: string[] = [];
  /** Card prices, gathered across every account and written once at the end. */
  const prices = new Map<string, ReturnType<typeof cardPricesFromSets>[number]>();

  for (const userId of await listAccountIds(db)) {
    try {
      const rows = await listRows(db, userId);
      // An account with nothing in it has no reading to take. Writing a zero
      // would start its chart at the day it signed up and claim the collection
      // was once worth nothing, which is not the same as not knowing.
      if (!rows.length) continue;

      // The same assembly every request reads, blended prices and memo included: what the
      // night writes is what the day shows, and the warm cron has usually just built it.
      const sets = await assembleFor(userId, db);
      // Read before tonight's point is written: `added` counts the copies since the point before.
      const stored = await listValueSnapshots(db, userId);
      const since = stored.filter((p) => p.date < date).at(-1)?.date ?? null;
      const point = snapshotFromSets(sets, date, since);
      await writeValueSnapshot(db, userId, point);
      // The read path caches for an hour under this tag and nothing else can
      // drop it — the manual script writes from plain node, where this does not
      // exist. Here it does, so the new point is on the dashboard immediately.
      revalidateTag(valueHistoryTag(userId), { expire: 0 });

      /*
       * The Home line's past, built again where it still holds the old series: what the collection
       * held each Saturday since 2024-02-10 and each night since 2026-08-16, at that day's
       * TCGplayer prices (holdingsSeries). Once per account, by needsHistoryRebuild(); `?history=1`
       * forces it, for after the price history itself is rewritten. After tonight's point, so a
       * rebuild that fails costs the past and never the night.
       */
      try {
        const items = flattenItems(sets);
        if (
          forceHistory ||
          needsHistoryRebuild(
            stored.map((p) => p.date),
            items,
          )
        ) {
          const ids = [...new Set(items.flatMap((it) => (it.owned && it.tcgId ? [it.tcgId] : [])))];
          const readings = await listHistoryPrices(
            db,
            ids,
            saturdaysBetween(HISTORY_FROM, HISTORY_DAILY_FROM),
            HISTORY_DAILY_FROM,
          );
          const series = holdingsSeries(items, readings).filter((p) => p.date < date);
          await replaceValueHistory(db, userId, series, date);
          revalidateTag(valueHistoryTag(userId), { expire: 0 });
          rebuilt.push({ user: userId, points: series.length });
        }
      } catch (err) {
        // Its own failure, not the account's: tonight's point and the card prices below stand, and
        // needsHistoryRebuild() still says yes tomorrow.
        console.error(`[cron] value history rebuild failed for ${userId}:`, err);
        failed.push(`history:${userId}`);
      }

      // Every held card's own price, for the movers list. Deduped across
      // accounts as it goes: two people holding the same card is one price, and
      // writing it twice would only make the two able to disagree.
      for (const p of cardPricesFromSets(sets, date)) prices.set(p.tcgId, p);

      written.push({ user: userId, value: Math.round(point.value), cards: point.cards });
    } catch (err) {
      // One account's failure is not the others'. Logged with the id so it can
      // be chased, and reported in the body so a monitor sees a partial run as
      // a partial run rather than as a success.
      console.error(`[cron] snapshot failed for ${userId}:`, err);
      failed.push(userId);
    }
  }

  // The weekly pass, added after the held cards so a held card's nightly point
  // is the one that stands. TCGplayer's figures for both shelves it sells, from
  // tcgcsv, in the one market every other line is in (since 2026-09-12; it read
  // Cardmarket's guide before).
  const url = new URL(req.url);
  const weekly = url.searchParams.get("all") === "1" || new Date().getUTCDay() === 6;
  let everyCard = 0;
  if (weekly) {
    try {
      const rate = await usdToEurForRequest();
      // No rate, no pass: a week of dollars written as euros would stand in the chart for good.
      if (rate == null) throw new Error("no dollar rate");
      const english = Object.fromEntries(
        Object.entries(TCGPLAYER_IDS as Record<string, { productId: number } | null>).map(
          ([id, v]) => [id, v?.productId ?? null],
        ),
      );
      const shelves: [Record<string, number | null>, number][] = [
        [english, TCGCSV_CATEGORY.en],
        [TCGPLAYER_IDS_JA as Record<string, number | null>, TCGCSV_CATEGORY.ja],
      ];
      for (const [products, category] of shelves) {
        const shelf = await shelfPrices(category);
        for (const p of cardPricesFromTcgcsv(products, shelf, rate, date)) {
          // English first, so an id two shelves share keeps the English reading.
          if (!prices.has(p.tcgId)) {
            prices.set(p.tcgId, p);
            everyCard++;
          }
        }
      }
    } catch (err) {
      console.error("[cron] weekly TCGplayer pass failed:", err);
      failed.push("tcgcsv");
    }
  }

  // After the loop, not inside it: the same card held by two people is one
  // row, and one upsert of the union beats one per account.
  if (prices.size) {
    try {
      await writeCardPrices(db, [...prices.values()]);
    } catch (err) {
      // A failure here costs the movers list, not the value history, and the
      // per-account snapshots above are already committed.
      console.error("[cron] writing card prices failed:", err);
      failed.push("card-prices");
    }
  }

  return NextResponse.json(
    {
      ok: failed.length === 0,
      date,
      written: written.length,
      rebuilt,
      prices: prices.size,
      everyCard,
      failed,
    },
    { status: failed.length ? 207 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
