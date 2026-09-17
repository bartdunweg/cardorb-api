import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { catalogueIndex, syncMirror } from "@/lib/core/catalogue/mirror";
import { syncLanguageMirror } from "@/lib/core/catalogue/mirror-language";
import { adminClient } from "@/lib/storage/supabase";

/**
 * The English catalogue, copied in, once a night.
 *
 * The search reads the copy (lib/core/catalogue/mirror.ts) instead of asking TCGdex twice per
 * keystroke; this is what keeps the copy true. Most needed first — a set the copy has never
 * seen, then one whose count moved, then the oldest — and as many as the minute allows, each
 * committed as it finishes, so a run cut short tomorrow continues where it stopped. The whole
 * catalogue is fresh again every few nights; a set published today is searchable tomorrow.
 *
 * Same bearer as the snapshot and the warm: `CRON_SECRET`, and fails closed without it. The
 * service role, for the same reason those two use it: there is nobody to be at half past three.
 */
export const dynamic = "force-dynamic";
/* 300 s, as the price job has: the Japanese copy asks one record per card, and on its first pass
   four sets took the whole minute and the function was cut off mid-set (2026-09-14). The English
   run keeps its 45 s budget inside it. */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set: refusing to copy the catalogue");
    return apiError(503, "Not configured.");
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "No.");
  }
  const db = adminClient();
  if (!db) return refuse("noDatabase");

  try {
    /* `?full=1`: work every set out from scratch instead of keeping the pictures the copy
       already has. For the day a source is added to the chain, whose cards were copied without
       a picture before it existed; the nightly schedule never asks for it. */
    const params = new URL(req.url).searchParams;
    /* `?sets=ex5.5,mep`: those sets alone, worked out from scratch, for a source added for a few of
       their cards; the nightly schedule never sets it. */
    const only = params.get("sets")?.split(",").filter(Boolean);
    /* `?language=ja`: the Japanese catalogue into the same copy (mirror-language.ts), on a schedule
       of its own so each has the whole minute. `?sets=` narrows it as it does the English copy. */
    if (params.get("language") === "ja") {
      const report = await syncLanguageMirror(db, "ja", {
        budgetMs: 200_000,
        ...(only?.length ? { only } : {}),
      });
      console.log(
        `[cron] catalogue ja: ${report.copied.length} sets copied, ${report.failed.length} failed, ${report.left} left, ${report.pictures} pictures changed, ${report.ms} ms`,
      );
      return NextResponse.json(report);
    }
    const full = params.get("full") === "1";
    const report = await syncMirror(db, { full, ...(only?.length ? { only } : {}) });
    // The document the browser searches in, rebuilt from what was just copied (mirror.ts).
    if (report.copied.length) await catalogueIndex(db);
    /* The collection keeps each set's facts, pictures included, for a day under the catalogue
       tag (set-facts in collection.ts), and nothing else dropped it: on 2026-09-14 the copy had
       moved 20,872 pictures into our bucket and the collection still named TCGdex for all of
       its cards. Stale while it refreshes, so the first read after this is not a cold build. */
    if (report.pictures) revalidateTag("catalogue", "max");
    console.log(
      `[cron] catalogue: ${report.copied.length} sets copied, ${report.failed.length} failed, ${report.left} left, ${report.pictures} pictures changed, ${report.ms} ms`,
    );
    return NextResponse.json(report);
  } catch (err) {
    console.error("[cron] copying the catalogue failed:", err);
    return refuse("catalogue");
  }
}
