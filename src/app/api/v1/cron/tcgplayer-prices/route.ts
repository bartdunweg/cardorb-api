import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { TCGCSV_CATEGORY, shelfPrintings } from "@/lib/core/catalogue/tcgcsv";
import { writeTcgplayerPrices } from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TCGplayer's English shelf into tcgplayer_prices, once a day.
 *
 * What the collection prices every card from (collection.ts, storedPricesFor): one query instead
 * of a request per card to TCGdex. tcgcsv publishes the day's figures in the evening, US time, so
 * this runs at 21:15 UTC and the snapshot at 04:00 prices the night's point off them.
 *
 * A shelf where fewer than nine groups in ten answered is not written: the rows already there
 * are yesterday's figures, which is better than today's for some sets and none for the rest.
 * Same bearer as the other crons: `CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set: refusing to copy TCGplayer's prices");
    return apiError(503, "Not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "No.");
  }
  const db = adminClient();
  if (!db) return refuse("noDatabase");

  const start = performance.now();
  try {
    const { rows, groups, answered } = await shelfPrintings(TCGCSV_CATEGORY.en);
    if (!groups || answered < groups * 0.9) {
      console.error(
        `[cron] tcgplayer prices: ${answered} of ${groups} groups answered, not written`,
      );
      return NextResponse.json({ ok: false, groups, answered, written: 0 }, { status: 502 });
    }
    const today = new Date().toISOString().slice(0, 10);
    await writeTcgplayerPrices(
      db,
      rows.map((r) => ({
        product_id: r.productId,
        printing: r.printing,
        market: r.market,
        updated_on: today,
      })),
    );
    const ms = Math.round(performance.now() - start);
    console.log(
      `[cron] tcgplayer prices: ${rows.length} printings from ${answered} groups, ${ms} ms`,
    );
    return NextResponse.json({ ok: true, groups, answered, written: rows.length, ms });
  } catch (err) {
    console.error("[cron] copying TCGplayer's prices failed:", err);
    return refuse("catalogue");
  }
}
