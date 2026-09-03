import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { revalidateTag } from "next/cache";
import { cardsTag, validateCardDraft } from "@/lib/core/collection/collection-row";
import { createRow } from "@/lib/storage/collection";
import {
  authorise,
  authoriseWrite,
  readHeaders,
  refused,
  storeErrorResponse,
} from "@/lib/api/guard";
import { getCollection } from "@/lib/core/collection/collection";
import {
  filterItems,
  flattenItems,
  pageOf,
  readItemQuery,
  sortItems,
} from "@/lib/core/collection/items";
import { BODY_LIMIT, readJsonBody } from "@/lib/api/body";
import { bearer } from "@/lib/api/viewer";

/**
 * Adding a card. The only endpoint here that changes anything, and the reason
 * the key exists.
 *
 * It does not get to fail soft. Reading fails into an empty state and nobody
 * loses anything; a write that fails quietly loses the card that was just
 * pulled. Every refusal comes back as a message a client can show, in the
 * store's own words where the store is the one refusing.
 */

/* The cap is BODY_LIMIT.card in lib/api/body.ts — "a card: eight short fields",
   the same 8,192 this file used to declare for itself. It moved because
   readJsonBody() was extracted from this handler and its sibling and then
   neither was migrated onto it, so the pattern lived in three places at once
   and R-API-004 was broken by the two routes it was written for. */

export const dynamic = "force-dynamic";

/**
 * One page of the collection as a flat list of copies — the shape a web list
 * with a search box wants. `GET /v1/collection` stays the grouped whole for
 * the iOS app. Both read the same cached assembly; see lib/core/collection/items.ts.
 */
export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, { headers: readHeaders(req) });

  const read = readItemQuery(new URL(req.url).searchParams);
  if (read.kind === "invalid")
    return apiError(400, read.error, undefined, { headers: readHeaders(req) });

  const { sets, failed } = await getCollection(who.userId, bearer(req) ?? undefined);
  if (failed) return unavailable();
  const { sort, order } = read.query;
  const { items, total } = pageOf(
    sortItems(filterItems(flattenItems(sets), read.query), sort, order),
    read.query,
  );
  return NextResponse.json({ cards: items, total }, { headers: readHeaders(req) });
}

export async function POST(req: Request) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, { headers: readHeaders(req) });

  const read = await readJsonBody(req, BODY_LIMIT.card);
  if (read.kind === "too-large") {
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  }
  if (read.kind === "invalid") {
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });
  }

  const result = validateCardDraft(read.body);
  if (result.kind === "invalid") {
    return apiError(400, result.error, undefined, { headers: readHeaders(req) });
  }

  let id: string;
  try {
    // The token, not just the draft: createRow() needs the caller's own
    // connection for cards_insert to authorise the write, see its own
    // comment in lib/storage/collection.ts.
    id = await createRow(result.draft, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Adding a card failed");
  }

  // One cache stands between the row and /v1/collection: cardsTag() drops the
  // rows cached for the person who just wrote. There used to be a second tag
  // on the store's own HTTP fetch, from when the store was Notion; Postgres is
  // not fetched, so nothing carries that tag any more and it is gone.
  //
  // There used to be a third — a promise memoised in this process, cleared here
  // by forgetCollection(). It is gone, and with it the whole read-your-own-write
  // problem its ten-minute TTL existed to bound: a per-process slot could not be
  // reached in the instances that were not serving this request, so the card
  // just added could be missing from the page it was added on for up to ten
  // minutes. Nothing is per-process any more, so a tag reaches all of it. That
  // simplification is the refactor paying for itself.
  //
  // `{ expire: 0 }` rather than a named profile: a profile means
  // stale-while-revalidate, so the next reader would be handed the collection
  // from before this row while the new one is fetched behind them. Expiring at
  // zero is what makes the card the writer's own write rather than the one
  // after it.
  revalidateTag(cardsTag(who.userId), { expire: 0 });

  return NextResponse.json({ ok: true, id }, { headers: readHeaders(req) });
}

/**
 * The preflight the JSON content type above forces. Without an answer to this,
 * a browser on the tool's own domain never gets as far as sending the POST.
 */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const ok = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .includes(origin ?? "");
  return new Response(null, {
    status: ok ? 204 : 403,
    headers: ok
      ? {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" },
  });
}
