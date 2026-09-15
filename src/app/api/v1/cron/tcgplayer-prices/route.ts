import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { fetchUsdToEur } from "@/lib/core/catalogue/rates";
import { TCGCSV_CATEGORY, shelfPrintings } from "@/lib/core/catalogue/tcgcsv";
import { priceHistoryTag, usdToEurForRequest } from "@/lib/core/collection/collection";
import { allFinishPrints, allPatternPrints } from "@/lib/core/catalogue/card-printings";
import { cardPricesFromShelf, type TcgplayerLink } from "@/lib/core/collection/snapshot";
import TCGPLAYER_IDS from "@/lib/core/tcgplayer-ids.generated.json";
import TCGPLAYER_IDS_JA from "@/lib/core/tcgplayer-ids.ja.generated.json";
import {
  listCatalogueProducts,
  printProductsOfCards,
  writeCardPrices,
  writeTcgplayerPrices,
  writeUsdEurRate,
} from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";
/** The shelf, a day of history for every English card and three months of thinning: more than a minute. */
export const maxDuration = 300;

/**
 * Below this a day of history is written every night; at or above it, Saturdays only. The free
 * plan's limit is 500 MB, where Supabase turns the project read-only. Never reached unannounced: from
 * 400 MB .github/workflows/storage-watch.yml opens an issue every Monday. Raise this with an upgrade.
 */
const DAILY_CEILING = 480 * 1024 * 1024;

/** Months thinned to one figure a week per run, so the months behind are caught up in days. */
const THIN_MONTHS = 3;

type Thinned = { month: string; rows: number };

/** The Japanese links name a card's product alone: tcgId to productId, no Shadowless run. */
const JAPANESE_LINKS: Record<string, TcgplayerLink> = Object.fromEntries(
  Object.entries(TCGPLAYER_IDS_JA as Record<string, number | null>).map(([id, productId]) => [
    id,
    productId == null ? null : { productId },
  ]),
);

/** The UTC day tcgcsv last published its files, from its last-updated.txt. */
async function publishedDay(): Promise<string> {
  const res = await fetch("https://tcgcsv.com/last-updated.txt", {
    headers: { "User-Agent": "cardorb.com" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`tcgcsv last-updated: ${res.status}`);
  const at = new Date((await res.text()).trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(at.getTime())) throw new Error("tcgcsv last-updated: not a date");
  return at.toISOString().slice(0, 10);
}

/**
 * TCGplayer's English and Japanese shelves, once a day: the latest figures and the day's line in
 * the history.
 *
 * The one price job since 2026-09-14. tcgcsv publishes the day's figures at 20:00 UTC, so this runs
 * at 21:15 and reads them once, for two tables:
 *
 * 1. tcgplayer_prices, what the collection prices every card from (collection.ts, storedPricesFor):
 *    one query instead of a request per card to TCGdex. A shelf where fewer than nine groups in ten
 *    answered is not written at all, neither table: the rows already there are yesterday's figures,
 *    which is better than today's for some sets and none for the rest.
 *
 * 2. card_price_months, today's point for every linked card, held or not, per printing and in euros
 *    at the day's rate (cardPricesFromShelf), Base Set's Shadowless runs under their own printings,
 *    the Poké Ball, Master Ball and Energy Symbol reverses as "poke-ball-reverse-holofoil" and so on, and
 *    the cosmos and cracked ice prints as "cosmos-holofoil" (since 2026-09-15).
 *    The 04:00 snapshot used to write these from the same files and from the assembled collection;
 *    it now writes only the cards with no TCGplayer product. No rate, no history tonight: dollars
 *    written as euros would stand in the chart for good, and the latest prices are written anyway.
 *    At DAILY_CEILING or over, history is written on Saturdays only; a size nobody could read counts
 *    as over.
 *
 * Then the archive is thinned: months entirely older than six months keep one figure a week
 * (migration 20260914150000, thin_oldest_price_month), up to THIN_MONTHS a run. A failure there is
 * logged and answered as `thinned: null`; the night's prices stand.
 *
 * The Japanese shelf (tcgcsv category 85) since 2026-09-14, read after the English one into the same
 * two tables: its product ids are TCGplayer's too and none is shared with the English shelf
 * (checked that day: 44,480 English and 22,445 Japanese printings, no product in both), and its
 * cards are keyed by TCGdex's Japanese ids (tcgplayer-ids.ja.generated.json, 9,259 linked). Its
 * current price was already read live from the same files (shelfUsdFor); what it gains is a history.
 * A Japanese shelf that does not answer costs only its own rows tonight; the English ones stand.
 *
 * The day's dollar rate since 2026-09-14: read from frankfurter here and written to usd_eur_rates,
 * which every request reads (collection.ts, storedUsdToEur), so no request asks an outside host for
 * it. The history below is converted at that same rate. A rate that cannot be read or written is
 * logged and answered as `rate.skipped`; the prices stand, and the history falls back to the rate a
 * request would use.
 *
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
  const now = new Date();
  /* The day the prices are, which is the day tcgcsv published them (its last-updated.txt, a UTC
     timestamp): not the clock. A run at 15:31 UTC on 2026-09-14, before that day's 20:05 publish,
     wrote Sunday's figures again under Monday, moved only by the new dollar rate. A file that cannot
     be read falls back to the clock, as the job always did. */
  const today = await publishedDay().catch(() => now.toISOString().slice(0, 10));
  let shelf: Awaited<ReturnType<typeof shelfPrintings>>;
  try {
    shelf = await shelfPrintings(TCGCSV_CATEGORY.en);
    const { groups, answered } = shelf;
    if (!groups || answered < groups * 0.9) {
      console.error(
        `[cron] tcgplayer prices: ${answered} of ${groups} groups answered, not written`,
      );
      return NextResponse.json({ ok: false, groups, answered, written: 0 }, { status: 502 });
    }
    await writeTcgplayerPrices(
      db,
      shelf.rows.map((r) => ({
        product_id: r.productId,
        printing: r.printing,
        market: r.market,
        updated_on: today,
      })),
    );
  } catch (err) {
    console.error("[cron] copying TCGplayer's prices failed:", err);
    return refuse("catalogue");
  }
  const { rows, groups, answered } = shelf;

  // The Japanese shelf, on its own: a failure or a thin answer here leaves its rows for tonight and
  // nothing else.
  const japanese: { groups: number; answered: number; written: number; skipped?: string } = {
    groups: 0,
    answered: 0,
    written: 0,
  };
  let japaneseRows: typeof rows = [];
  try {
    const ja = await shelfPrintings(TCGCSV_CATEGORY.ja);
    japanese.groups = ja.groups;
    japanese.answered = ja.answered;
    if (!ja.groups || ja.answered < ja.groups * 0.9) {
      japanese.skipped = "too few groups answered";
    } else {
      await writeTcgplayerPrices(
        db,
        ja.rows.map((r) => ({
          product_id: r.productId,
          printing: r.printing,
          market: r.market,
          updated_on: today,
        })),
      );
      japaneseRows = ja.rows;
      japanese.written = ja.rows.length;
    }
  } catch (err) {
    console.error("[cron] copying TCGplayer's Japanese prices failed:", err);
    japanese.skipped = "read or write failed";
  }

  let ok = true;
  const databaseBytes = await (async (): Promise<number | null> => {
    try {
      const { data, error } = await db.rpc("database_size_bytes");
      return error || typeof data !== "number" ? null : data;
    } catch {
      return null;
    }
  })();

  // The day's dollar rate, into our own store. Never fails the job.
  const usdEur: { rate: number | null; stored: boolean; skipped?: string } = {
    rate: null,
    stored: false,
  };
  try {
    usdEur.rate = await fetchUsdToEur();
    await writeUsdEurRate(db, today, usdEur.rate);
    usdEur.stored = true;
  } catch (err) {
    console.error("[cron] storing the dollar rate failed:", err);
    usdEur.skipped = usdEur.rate == null ? "read failed" : "write failed";
  }

  // Today's line in the history, from the same rows.
  const history: { written: number; skipped?: string } = { written: 0 };
  const roomForDaily = databaseBytes != null && databaseBytes < DAILY_CEILING;
  if (!roomForDaily && now.getUTCDay() !== 6) {
    history.skipped =
      databaseBytes == null ? "database size unknown" : "database over the daily ceiling";
  } else {
    const rate = usdEur.rate ?? (await usdToEurForRequest());
    if (rate == null) {
      console.error("[cron] tcgplayer prices: no dollar rate, no history tonight");
      history.skipped = "no dollar rate";
    } else {
      try {
        /* The Japanese links are the committed map and every product the copy matched out of
           TCGplayer's Japanese shelf (tcgplayer-japan.ts): 9,259 in the map, 15,844 in the copy on
           2026-09-14, and a card priced from the second had no line in the history. */
        const copied = await listCatalogueProducts(db, "ja").catch((err) => {
          console.error("[cron] the copy's Japanese products unreadable, the map alone:", err);
          return new Map<string, number>();
        });
        const japaneseLinks: Record<string, TcgplayerLink> = { ...JAPANESE_LINKS };
        /* A Japanese card's mirror holo and ball reverses, each a product of its own, matched by the
           print-pictures cron (card_print_pictures): their own line under the card, as an English
           card's patterned reverses have had since 2026-09-14. Unreadable, the cards' own lines stand. */
        const japaneseFinishPrints = Object.fromEntries(
          [
            ...(
              await printProductsOfCards(db, "ja").catch((err) => {
                console.error("[cron] the Japanese printings' products unreadable:", err);
                return new Map<string, { finish: string; productId: number }[]>();
              })
            ).entries(),
          ].map(([id, prints]) => [id, prints.map((p) => ({ ...p, printing: "holofoil" }))]),
        );
        for (const [id, productId] of copied) japaneseLinks[id] ??= { productId };
        /* Each shelf's points under its own catalogue: 14 ids are cards in both (neo4-100 to
           neo4-113), and a Japanese product under one of them once wrote Chansey's figure into
           Shining Celebi's history. The language is part of the history's key since migration
           20260915161000, so a Japanese card under a shared id has its own line. */
        const points = [
          ...cardPricesFromShelf(
            "en",
            TCGPLAYER_IDS as Record<string, TcgplayerLink>,
            rows,
            rate,
            today,
            allFinishPrints(),
            allPatternPrints(),
          ),
          ...cardPricesFromShelf(
            "ja",
            japaneseLinks,
            japaneseRows,
            rate,
            today,
            japaneseFinishPrints,
          ),
        ];
        await writeCardPrices(db, points);
        history.written = points.length;
        // Every card's chart reads the new day now, not when its hour in the cache runs out.
        revalidateTag(priceHistoryTag, { expire: 0 });
      } catch (err) {
        console.error("[cron] writing today's price history failed:", err);
        history.skipped = "write failed";
        ok = false;
      }
    }
  }

  // Months entirely older than six months: before the first of the month six months back.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1))
    .toISOString()
    .slice(0, 10);
  let thinned: Thinned[] | null = null;
  try {
    const { data, error } = await db.rpc("thin_oldest_price_month", {
      p_before: cutoff,
      p_months: THIN_MONTHS,
    });
    if (error) throw new Error(error.message);
    thinned = ((data ?? []) as Thinned[]).map((t) => ({ month: t.month, rows: t.rows }));
  } catch (err) {
    console.error("[cron] thinning the price archive failed:", err);
  }

  const ms = Math.round(performance.now() - start);
  console.log(
    `[cron] tcgplayer prices: ${rows.length} printings from ${answered} groups, ` +
      `${history.written} history points${history.skipped ? ` (${history.skipped})` : ""}, ` +
      `${thinned ? thinned.length : "no"} months thinned, ${ms} ms`,
  );
  return NextResponse.json({
    ok,
    groups,
    answered,
    written: rows.length,
    japanese,
    rate: usdEur,
    history,
    thinned,
    databaseBytes,
    ms,
  });
}
