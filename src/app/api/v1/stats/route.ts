import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCollection } from "@/lib/core/collection/collection";
import { countStats } from "@/lib/core/collection/items";

export const dynamic = "force-dynamic";

/** The dashboard's numbers, counted from the cached assembly. */
export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, { headers: readHeaders(req) });

  const { sets, failed, catalogueUnavailable } = await getCollection(
    who.userId,
    bearer(req) ?? undefined,
  );
  if (failed) return unavailable();
  // Flagged during a TCGdex outage: the counts are right, the value is zero for
  // want of prices, and a client should not read that as a collection worth nothing.
  return NextResponse.json(
    { stats: countStats(sets), ...(catalogueUnavailable ? { catalogueUnavailable } : {}) },
    { headers: readHeaders(req) },
  );
}
