import { NextResponse } from "next/server";
import { refuse, apiError } from "@/lib/api/respond";
import { assembleFor } from "@/lib/core/collection/collection";
import { cardPricesFromSets, snapshotFromSets } from "@/lib/core/collection/snapshot";
import { valueHistoryTag } from "@/lib/core/collection/value-snapshot";
import { revalidateTag } from "next/cache";
import {
  listAccountIds,
  listRows,
  writeCardPrices,
  writeValueSnapshot,
} from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";

/**
 * One value reading per account, once a night.
 *
 * It was once a week, which is why the chart on the dashboard had four points
 * in it eight months after the table shipped. Nightly is both the ceiling and
 * the right answer, and neither reason is a preference: this is a Vercel Hobby
 * project, where a cron may be triggered at most once a day, and the price
 * guide read below is itself only rebuilt nightly — running twice would write
 * the same number twice. It cannot make history, only density from here on;
 * scripts/snapshot-collection-value.mjs already went looking for an archive to
 * backfill from and found two copies of the guide, total.
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
 * This used to price through Cardmarket's public guide alone, with the build
 * told `{ prices: false }`, because pricing a collection card by card cost a
 * TCGdex request each. The assembly no longer does: it reads the daily guide
 * once, then TCGplayer for what the guide lacks, per set and cached
 * (collection.ts, factsWithUsd). So the night reads the same assembly every
 * request reads — the warm cron has usually just built it — and writes the
 * blended figure. Before, a folder's line ended under its live number and a
 * card's sheet said one price above a line that ended at another.
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

  // Dated by the night it runs, in UTC: the assembly's guide is today's, and the per-card
  // readings share the date so a folder's line and the collection's agree on the day.
  const date = new Date().toISOString().slice(0, 10);
  const written: { user: string; value: number; cards: number }[] = [];
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
      const point = snapshotFromSets(sets, date);
      await writeValueSnapshot(db, userId, point);
      // The read path caches for an hour under this tag and nothing else can
      // drop it — the manual script writes from plain node, where this does not
      // exist. Here it does, so the new point is on the dashboard immediately.
      revalidateTag(valueHistoryTag(userId), { expire: 0 });

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
      prices: prices.size,
      failed,
    },
    { status: failed.length ? 207 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
