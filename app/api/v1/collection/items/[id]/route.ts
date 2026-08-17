import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { CARDS_TAG, cardsTag, validateCardPatch } from "../../../../../../lib/core/collection-row";
import { updateRow, deleteRow } from "../../../../../../lib/storage/collection";
import {
  authoriseWrite,
  readHeaders,
  refused,
  storeErrorResponse,
} from "../../../../../../lib/api/guard";
import { bearer } from "../../../../../../lib/api/viewer";

/**
 * One printing, changed or removed.
 *
 * At /v1/collection/items/[id] rather than /v1/cards/[id]: Next refuses two
 * dynamic routes at the same path whose segments are named differently, and
 * /v1/cards/[tcgId] already exists — a public, unauthenticated-by-ownership
 * catalogue lookup by TCGdex id. This id is a private Postgres row id,
 * addressed by RLS to its owner; giving the two a shared path would have
 * meant naming one segment two things or quietly overloading what it means,
 * neither of which is worth it to save a URL segment.
 *
 * The sibling POST /v1/cards never had these, because nothing below it could
 * do them: cards_update and cards_delete existed in the accounts migration
 * from the start, but the storage layer only ever exposed list/write/options,
 * and Postgres's own deleteRow() had no caller anywhere in the app. See
 * docs/decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md for
 * why a printing rather than a card is what this addresses — the same id
 * OwnedCard.variants[].id carries.
 *
 * Same guard as POST /v1/cards, same body-size ceiling, same cache
 * revalidation. The one real difference is the id in the path: neither
 * handler below trusts a `user_id` in the body the way an insert could not
 * either — cards_update/cards_delete are `using (user_id = auth.uid())`, so a
 * caller can only ever reach their own row, whatever id they name.
 */
const MAX_BODY_BYTES = 4_096;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const { id } = await params;

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

  const result = validateCardPatch(body);
  if (result.kind === "invalid") {
    return NextResponse.json({ error: result.error }, { status: 400, headers: readHeaders(req) });
  }

  let row;
  try {
    row = await updateRow(id, result.patch, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Updating a card failed");
  }

  revalidateTag(CARDS_TAG, { expire: 0 });
  revalidateTag(cardsTag(who.userId), { expire: 0 });

  return NextResponse.json({ ok: true, card: row }, { headers: readHeaders(req) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const { id } = await params;

  try {
    await deleteRow(id, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Deleting a card failed");
  }

  revalidateTag(CARDS_TAG, { expire: 0 });
  revalidateTag(cardsTag(who.userId), { expire: 0 });

  return NextResponse.json({ ok: true }, { headers: readHeaders(req) });
}

/** Same preflight POST /v1/cards answers, for the same reason. */
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
          "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, x-cards-key",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" },
  });
}
