import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { apiError } from "@/lib/api/respond";
import { authoriseWrite, readHeaders, refused, storeErrorResponse } from "@/lib/api/guard";
import { BODY_LIMIT, readJsonBody } from "@/lib/api/body";
import { bearer } from "@/lib/api/viewer";
import { findFolder } from "@/lib/core/collection/collection";
import { cardsTag, validateCardPatch, validateItemIds } from "@/lib/core/collection/collection-row";
import { updateRows } from "@/lib/storage/collection";
import { forgetOnTheWeb } from "@/lib/api/web-cache";

/**
 * The same change to many copies at once.
 *
 * The store keeps one row per purchase, so four identical copies are four rows, and a
 * client saying "these are Near Mint" about the four had to say it four times — four round
 * trips from a browser, each one folding the rows on its own. This takes `ids` beside the
 * same body `PATCH /v1/collection/items/{id}` takes and does it in one statement.
 *
 * Same guard, same checks on the patch and on a folder named in it. The ids are the caller's
 * rows or nothing: RLS and the `user_id` in the query make nothing of anybody else's, so an
 * id that is not there or not theirs is simply not among the rows that come back. None at
 * all is the same 404 the single route gives, so the list cannot be used to ask which rows
 * exist.
 */
const NOT_FOUND = "No such card.";

export async function PATCH(req: Request) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const read = await readJsonBody<Record<string, unknown>>(req, BODY_LIMIT.patchMany);
  if (read.kind === "too-large")
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  if (read.kind === "invalid")
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });

  const { ids, ...fields } = read.body ?? {};
  const named = validateItemIds(ids);
  if (named.kind === "invalid")
    return apiError(400, named.error, undefined, { headers: readHeaders(req) });
  const result = validateCardPatch(fields);
  if (result.kind === "invalid")
    return apiError(400, result.error, undefined, { headers: readHeaders(req) });

  if (typeof result.patch.collectionId === "string") {
    let target;
    try {
      target = await findFolder(who.userId, result.patch.collectionId, bearer(req) ?? undefined);
    } catch (err) {
      return storeErrorResponse(err, req, "Reading the folder failed");
    }
    if (!target)
      return apiError(404, "No folder by that id.", undefined, { headers: readHeaders(req) });
    if (target.rule)
      return apiError(
        400,
        "That folder fills itself from a rule. Cards cannot be filed in it.",
        undefined,
        { headers: readHeaders(req) },
      );
  }

  let cards;
  try {
    cards = await updateRows(who.userId, named.ids, result.patch, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Updating the cards failed");
  }
  if (cards.length === 0) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });

  revalidateTag(cardsTag(who.userId), { expire: 0 });
  await forgetOnTheWeb(who);

  return NextResponse.json({ ok: true, cards }, { headers: readHeaders(req) });
}

/** Same preflight `PATCH /v1/collection/items/{id}` answers, for the same reason. */
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
          "Access-Control-Allow-Methods": "PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" },
  });
}
