import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CARDS_TAG, cardsTag, validateCardDraft } from "@/lib/core/collection/collection-row";
import { createRow } from "@/lib/storage/collection";
import { authoriseWrite, readHeaders, refused, storeErrorResponse } from "@/lib/api/guard";
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

export async function POST(req: Request) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const read = await readJsonBody(req, BODY_LIMIT.card);
  if (read.kind === "too-large") {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: readHeaders(req) },
    );
  }
  if (read.kind === "invalid") {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: readHeaders(req) },
    );
  }

  const result = validateCardDraft(read.body);
  if (result.kind === "invalid") {
    return NextResponse.json({ error: result.error }, { status: 400, headers: readHeaders(req) });
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

  // Two caches stand between the row and /v1/collection, and they are two
  // because the store is fetched over HTTP: CARDS_TAG drops the store's own
  // query, cardsTag() drops the rows cached for the person who just wrote.
  // Both, because dropping only one leaves the other answering.
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
  revalidateTag(CARDS_TAG, { expire: 0 });
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
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, x-cards-key",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" },
  });
}
