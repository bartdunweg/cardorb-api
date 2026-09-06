import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { getPublicCollection } from "@/lib/core/collection/collection";
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

  const warmed: { user: string; sets: number; ms: number }[] = [];
  const failed: string[] = [];
  for (const userId of await listAccountIds(db)) {
    const start = performance.now();
    const { sets, failed: miss } = await getPublicCollection(userId);
    if (miss) failed.push(userId);
    else
      warmed.push({ user: userId, sets: sets.length, ms: Math.round(performance.now() - start) });
  }
  return NextResponse.json({ warmed, failed }, { status: failed.length ? 207 : 200 });
}
