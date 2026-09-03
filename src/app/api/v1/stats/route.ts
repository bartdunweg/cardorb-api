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
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { sets, failed } = await getCollection(who.userId, bearer(req) ?? undefined);
  if (failed) return unavailable(undefined, readHeaders(req));
  return NextResponse.json({ stats: countStats(sets) }, { headers: readHeaders(req) });
}
