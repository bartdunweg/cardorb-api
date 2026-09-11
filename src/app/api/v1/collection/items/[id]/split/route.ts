import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { apiError } from "@/lib/api/respond";
import { authoriseWrite, readHeaders, refused, storeErrorResponse } from "@/lib/api/guard";
import { BODY_LIMIT, readJsonBody } from "@/lib/api/body";
import { bearer } from "@/lib/api/viewer";
import { findFolder } from "@/lib/core/collection/collection";
import { cardsTag, UUID, validateCopyBody } from "@/lib/core/collection/collection-row";
import { splitRow } from "@/lib/storage/collection";

/**
 * Some of a row's copies as a row of their own: the source loses `count`, the copy
 * is born with the differences and the source's acquired date. Every copy at once
 * is no split: change the row.
 *
 * The body is the copy's differences (finish, condition, grade, language,
 * purchase price and date, notes, folder, acquired date) and `count`. A folder
 * named must be the caller's and filled by hand, as PATCH requires.
 */
const NOT_FOUND = "No such card.";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { id } = await params;
  if (!UUID.test(id)) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });

  const read = await readJsonBody(req, BODY_LIMIT.patch);
  if (read.kind === "too-large")
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  if (read.kind === "invalid")
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });

  const result = validateCopyBody(read.body ?? {}, true);
  if (result.kind === "invalid")
    return apiError(400, result.error, undefined, { headers: readHeaders(req) });

  if (typeof result.changes.collectionId === "string") {
    let target;
    try {
      target = await findFolder(who.userId, result.changes.collectionId, bearer(req) ?? undefined);
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

  let split;
  try {
    split = await splitRow(who.userId, id, result.count, result.changes, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Splitting a card failed");
  }
  if (split.kind === "missing")
    return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });
  if (split.kind === "same")
    return apiError(400, "Same in every way: change the quantity instead.", undefined, {
      headers: readHeaders(req),
    });
  if (split.kind === "too-many")
    return apiError(400, "That is every copy. Change the row instead of splitting it.", undefined, {
      headers: readHeaders(req),
    });

  revalidateTag(cardsTag(who.userId), { expire: 0 });
  return NextResponse.json(
    { ok: true, card: split.copy, source: split.source },
    { status: 201, headers: readHeaders(req) },
  );
}

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
          "Access-Control-Allow-Headers": "content-type, authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" },
  });
}
