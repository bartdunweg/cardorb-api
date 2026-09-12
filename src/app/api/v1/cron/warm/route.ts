import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { getPublicCollection, rememberCollectionScans } from "@/lib/core/collection/collection";
import { listAccountIds } from "@/lib/storage/postgres";
import { adminClient } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Assemble every account's collection, so the caches under it are warm before a person asks.
 *
 * A deploy that touches collection.ts empties the set-facts entries (an `unstable_cache` key
 * carries its function's source), and the first request after it rebuilt every set: thirteen
 * seconds measured on 2026-09-06, and the web app's "could not load" once. Vercel's cron runs
 * this every ten minutes: the miss is paid here, on nobody's screen, and the instance that
 * served it keeps the assembled collection in memory for the next ten (collection.ts).
 * Same bearer as the snapshot: `CRON_SECRET`.
 *
 * It also writes down the picture each card was just resolved to (remembered-scans.ts), which
 * is the one thing here that is not only a cache: a row that has been seen with a scan keeps it,
 * so a catalogue that goes quiet for a day can no longer empty a whole set of tiles. Only what
 * changed is written, so after the first pass this is usually no write at all.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set: refusing to warm");
    return apiError(503, "Not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "No.");
  }
  const db = adminClient();
  if (!db) return refuse("noDatabase");

  const warmed: { user: string; sets: number; remembered: number; ms: number }[] = [];
  const failed: string[] = [];
  for (const userId of await listAccountIds(db)) {
    const start = performance.now();
    const { sets, failed: miss, catalogueUnavailable } = await getPublicCollection(userId);
    if (miss) {
      failed.push(userId);
      continue;
    }
    // Never off a collection served without the catalogue: those cards carry what the rows
    // already remember, so writing it back would be the memory copying itself.
    const remembered = catalogueUnavailable
      ? 0
      : await rememberCollectionScans(userId, sets, db).catch((err) => {
          console.error("[cron] a collection could not remember its pictures:", err);
          return 0;
        });
    warmed.push({
      user: userId,
      sets: sets.length,
      remembered,
      ms: Math.round(performance.now() - start),
    });
  }
  return NextResponse.json({ warmed, failed }, { status: failed.length ? 207 : 200 });
}
