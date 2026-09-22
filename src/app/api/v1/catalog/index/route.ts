import { apiError, refuse } from "@/lib/api/respond";
import { authoriseOpen, openReadHeaders, readHeaders, refused } from "@/lib/api/guard";
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
 * Kept in the browser under its version: the one answer to a named caller here that is not
 * `no-store`, because it is nobody's data (a card's name is the same for everyone) and it is
 * the size of a small image. A request carrying the version it holds gets 304 and no body.
 *
 * Open, because the command palette searches this document in the browser and has to work for
 * a visitor with no account. There is nothing to leave out for such a reader: the document
 * carries no holdings, no prices and no name, so the only thing the credential decides is who
 * may hold the answer.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authoriseOpen(req);
  if (who && refused(who)) {
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
    /* Two windows on one document, and the ETag is under both: a copy that has not changed
       answers 304 with no body at all, whoever asked.

       A named caller keeps it in their own browser and asks about it every time rather than
       believing it for a day. The document changes the moment the nightly copy has run, or a
       correction to it has shipped, and `max-age=86400` meant a browser that had it went on
       searching yesterday's catalogue for a day: a card whose picture was fixed today (svp-085,
       Pikachu with Grey Felt Hat) stayed a blank square until the cache let go.

       A reader who named nobody gets the open window instead, because that answer is the same
       document for everybody and worth a shared cache holding. Its `max-age=0` keeps the
       browser revalidating, as `no-cache` does, so the correction still lands on the next load;
       only the CDN holds it, for the minute this repo already settled on elsewhere. */
    const headers = who
      ? {
          ...readHeaders(req),
          "Cache-Control": "private, no-cache",
          ETag: etag,
          Vary: "Origin, Authorization",
        }
      : { ...openReadHeaders(req), ETag: etag };
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
