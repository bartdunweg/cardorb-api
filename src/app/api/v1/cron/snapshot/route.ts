import { NextResponse } from "next/server";
import { refuse, apiError } from "@/lib/api/respond";
import { assembleFor } from "@/lib/core/collection/collection";
import {
  cardPricesFromSets,
  unlinkedCardPrices,
  type TcgplayerLink,
} from "@/lib/core/collection/snapshot";
import TCGPLAYER_IDS from "@/lib/core/tcgplayer-ids.generated.json";
import TCGPLAYER_IDS_JA from "@/lib/core/tcgplayer-ids.ja.generated.json";
import { historyKey } from "@/lib/core/price-months.mjs";
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
import { flattenItems, pricedCardsOf } from "@/lib/core/collection/items";
import {
  HISTORY_FROM,
  needsHistoryRebuild,
  nightReadFrom,
  nightlyPoints,
} from "@/lib/core/collection/value-history";
import { adminClient } from "@/lib/storage/supabase";

/**
 * Each catalogue's committed TCGplayer links, the cards the price job writes from tcgcsv. The Japanese
 * map names a product alone.
 */
const LINKS = {
  en: TCGPLAYER_IDS as Record<string, TcgplayerLink>,
  ja: Object.fromEntries(
    Object.entries(TCGPLAYER_IDS_JA as Record<string, number | null>).map(([id, productId]) => [
      id,
      productId == null ? null : { productId },
    ]),
  ),
};

/**
 * One value reading per account, once a night: since 2026-09-17 the last week before the night, summed
 * from the held cards' readings (nightlyPoints), so the stored points and the Home line agree.
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
 * with three points in it, put there by hand, and nothing added a fourth: a
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
 * nothing here (this client is past it), so the only thing standing between
 * this route and a stranger writing to everyone's history is CRON_SECRET, and
 * a missing secret is treated as a closed door rather than an open one.
 *
 * ── The cards TCGplayer has no product for ────────────────────────────────
 *
 * Since 2026-09-14 the day's line for every card TCGplayer sells, held or not, is written by the
 * one price job (cron/tcgplayer-prices, 21:15 UTC) straight from tcgcsv, the same files it writes
 * tcgplayer_prices from; its DAILY_CEILING rule and the every-card pass moved there with it. What
 * is left here is a held card with no TCGplayer product in its own catalogue's committed map
 * (tcgplayer-ids.generated.json, tcgplayer-ids.ja.generated.json since 2026-09-15): the night
 * reads it from the same assembly every request reads, so what the night writes is what the day
 * shows. Writing a linked card from the collection as well was the loop that could store an old
 * figure the collection still carried as a new day's, so a linked card is never written here.
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
  const prices = new Map<string, ReturnType<typeof cardPricesFromSets>>();

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
      // Read before the night's points are written: whether the history was ever built, below.
      const stored = await listValueSnapshots(db, userId);
      /* The last week before tonight, summed from the held cards' readings as the recent days of the
         Home line are (nightlyPoints). A point from the collection as assembled at 04:00 was a day
         behind that line and a few cents off, and stepped into view on its ninety-first day. */
      const items = flattenItems(sets);
      const readings = await listHistoryPrices(
        db,
        pricedCardsOf(items.filter((it) => it.owned)),
        nightReadFrom(date),
      );
      const points = nightlyPoints(items, readings, date);
      for (const point of points) await writeValueSnapshot(db, userId, point);
      // The read path caches for an hour under this tag and nothing else can
      // drop it: the manual script writes from plain node, where this does not
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
        if (
          forceHistory ||
          needsHistoryRebuild(
            stored.map((p) => p.date),
            items,
          )
        ) {
          const cards = pricedCardsOf(items.filter((it) => it.owned));
          const readings = await listHistoryPrices(db, cards, HISTORY_FROM);
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

      // Every held card's own price with no TCGplayer product, for the movers list and the lines;
      // the price job writes every linked one from tcgcsv. Deduped across accounts as it goes: two
      // people holding the same card is one price, and writing it twice would only make the two
      // able to disagree.
      for (const p of unlinkedCardPrices(cardPricesFromSets(sets, date), LINKS)) {
        const key = historyKey(p.language, p.tcgId);
        const days = prices.get(key);
        if (days) days.push(p);
        else prices.set(key, [p]);
      }

      const last = points.at(-1);
      written.push({ user: userId, value: Math.round(last?.value ?? 0), cards: last?.cards ?? 0 });
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
      await writeCardPrices(db, [...prices.values()].flat());
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
      failed,
    },
    { status: failed.length ? 207 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
