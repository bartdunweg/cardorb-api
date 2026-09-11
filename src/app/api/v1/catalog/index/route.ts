import { apiError, refuse } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { catalogueIndex } from "@/lib/core/catalogue/mirror";
import { adminClient } from "@/lib/storage/supabase";

/**
 * The English catalogue as one document, for the browser to search in.
 *
 * A search that asks a server is a round trip however fast the query is — 0.7 to 1.0 s from
 * cardorb.com on 2026-09-11 with the copy filled and the query at 1 ms — so the whole copy
 * goes to the browser once and the typing is answered there; what is personal or daily comes
 * after, from /v1/catalog/cards, for the twenty hits shown. The shape is
 * lib/core/catalogue/mirror.ts's CatalogueIndex, built after every nightly copy.
 *
 * Cached a day in the browser under its version: the one authorised answer here that is not
 * `no-store`, because it is nobody's data — a card's name is the same for everyone — and it
 * is the size of a small image. `private` all the same, so nothing between caches it for the
 * next caller. A request carrying the version it holds gets 304 and no body.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who)) {
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });
  }
  const db = adminClient();
  if (!db) return refuse("noDatabase", { headers: readHeaders(req) });

  try {
    const index = await catalogueIndex(db);
    if (!index)
      return apiError(404, "The catalogue has not been copied yet.", undefined, {
        headers: readHeaders(req),
      });
    const etag = `"${index.version}"`;
    const headers = {
      ...readHeaders(req),
      "Cache-Control": "private, max-age=86400",
      ETag: etag,
      Vary: "Origin, Authorization",
    };
    if (req.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(index.body, {
      status: 200,
      headers: { ...headers, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Catalogue index unavailable:", err);
    return refuse("noDatabase", { headers: readHeaders(req) });
  }
}
