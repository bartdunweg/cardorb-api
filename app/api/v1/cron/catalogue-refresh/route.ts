import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshCatalogueIndex } from "../../../../../lib/core/catalogue-index";

/**
 * The weekly walk of every TCGdex set, kept off the request path.
 *
 * refreshCatalogueIndex() (lib/core/catalogue-index.ts) is what
 * /api/v1/catalog/search's no-set path reads from — this route is only the
 * timer that keeps it warm. Weekly, not daily like /api/v1/health: a set does
 * not change once TCGdex has published it, a new one lands only occasionally,
 * and there's nothing to gain from asking more often than the data changes.
 *
 * Unlike health, this triggers ~48 outbound TCGdex requests and a bulk write
 * on every call, so it is not left open the way health is — CRON_SECRET gates
 * it, checked the same constant-time way guard.ts checks CARDS_TOKEN, so a
 * wrong guess costs the same as a right one.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretIsRight(given: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  // Vercel's own cron sends this as `Authorization: Bearer <CRON_SECRET>`; a
  // manual trigger (curl, during setup) can use the same header.
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!secretIsRight(given)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    const result = await refreshCatalogueIndex();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Catalogue refresh failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
