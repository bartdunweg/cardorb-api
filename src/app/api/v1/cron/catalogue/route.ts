import { NextResponse } from "next/server";
import { apiError, refuse } from "@/lib/api/respond";
import { catalogueIndex, syncMirror } from "@/lib/core/catalogue/mirror";
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
export const maxDuration = 60;

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
    const report = await syncMirror(db);
    // The document the browser searches in, rebuilt from what was just copied (mirror.ts).
    if (report.copied.length) await catalogueIndex(db);
    console.log(
      `[cron] catalogue: ${report.copied.length} sets copied, ${report.failed.length} failed, ${report.left} left, ${report.ms} ms`,
    );
    return NextResponse.json(report);
  } catch (err) {
    console.error("[cron] copying the catalogue failed:", err);
    return refuse("catalogue");
  }
}
