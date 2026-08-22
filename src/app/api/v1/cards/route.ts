import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CARDS_TAG, cardsTag, validateCardDraft } from "@/lib/core/collection-row";
import { createRow } from "@/lib/storage/collection";
import { authoriseWrite, readHeaders, refused, storeErrorResponse } from "@/lib/api/guard";
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

/** A card is eight short fields. Anything near this is a paste accident. */
const MAX_BODY_BYTES = 8_192;

export async function POST(req: Request) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: readHeaders(req) },
    );
  }

  let body: unknown;
  try {
    const raw = await req.text();
    // content-length can lie or be absent (chunked); check what arrived.
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413, headers: readHeaders(req) },
      );
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: readHeaders(req) },
    );
  }

  const result = validateCardDraft(body);
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
