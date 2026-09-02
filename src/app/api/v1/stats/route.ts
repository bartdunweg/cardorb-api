import { NextResponse } from "next/server";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCards } from "@/lib/core/collection/collection";
import { countStats } from "@/lib/core/collection/items";

export const dynamic = "force-dynamic";

/** The dashboard's numbers, counted from the cached assembly. */
export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const sets = await getCards(who.userId, bearer(req) ?? undefined);
  return NextResponse.json({ stats: countStats(sets) }, { headers: readHeaders(req) });
}
