import { unavailable, apiError } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import { getCollection } from "@/lib/core/collection/collection";
import { dexCsv } from "@/lib/core/collection/dex-export";
import { flattenItems } from "@/lib/core/collection/items";

/**
 * The collection as a file: every copy held and every card wanted, in the
 * shape Dex writes. See dex-export.ts for the columns and why.
 *
 * UTF-8 with a byte order mark and CRLF, which is what Excel and Numbers open
 * without being asked about encodings (Dex itself writes UTF-16; this app's
 * import reads either). Named by the day, so two exports a week apart do not
 * overwrite each other in a Downloads folder.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { sets, failed } = await getCollection(who.userId, bearer(req) ?? undefined);
  if (failed) return unavailable(undefined, readHeaders(req));

  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + dexCsv(flattenItems(sets)), {
    headers: {
      ...readHeaders(req),
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cardorb-${day}.csv"`,
    },
  });
}
