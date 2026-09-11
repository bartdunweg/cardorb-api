import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { revalidateTag } from "next/cache";
import {
  authorise,
  authoriseWrite,
  readHeaders,
  refused,
  storeErrorResponse,
} from "@/lib/api/guard";
import { BODY_LIMIT, readJsonBody } from "@/lib/api/body";
import { bearer } from "@/lib/api/viewer";
import { cardsTag, foldersTag, UUID } from "@/lib/core/collection/collection-row";
import { readFolderBody } from "@/lib/core/collection/folders";
import { deleteFolder, getFolder, updateFolder } from "@/lib/storage/collection";

import { forgetOnTheWeb } from "@/lib/api/web-cache";
/**
 * One sentence for the five places this route says it, through apiError() like
 * every other refusal here.
 *
 * It used to be an object handed to NextResponse.json() — a hand-rolled `{
 * error }` beside the helper written to stop exactly that (R-API-006). Nothing
 * was wrong with the body it produced; what was wrong is that the shape was
 * being re-typed, which is how the four wordings of "there is no database"
 * happened. This route was open, so it moved.
 */
const NOT_FOUND = "No folder by that id.";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { id } = await params;
  if (!UUID.test(id)) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });

  const read = await readJsonBody(req, BODY_LIMIT.folder);
  if (read.kind === "too-large")
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  if (read.kind === "invalid")
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });

  const body = readFolderBody(read.body, "patch");
  if (body.kind === "invalid")
    return apiError(400, body.error, undefined, { headers: readHeaders(req) });

  // A folder keeps its kind: one filled by hand cannot take a rule, and the reader above
  // already refuses a null rule. The read before the write turns "wrong kind" into a 400
  // the client can show rather than a silent no-op.
  const token = bearer(req) ?? undefined;
  let folder;
  try {
    const before = await getFolder(who.userId, id, token);
    if (!before) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });
    if (body.body.rule && !before.rule)
      return apiError(400, "This folder is filled by hand; it cannot take a rule.", undefined, {
        headers: readHeaders(req),
      });
    folder = await updateFolder(who.userId, id, body.body, token);
  } catch (err) {
    return storeErrorResponse(err, req, "Changing a folder failed");
  }
  if (!folder) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });

  revalidateTag(foldersTag(who.userId), { expire: 0 });
  await forgetOnTheWeb(who);
  return NextResponse.json({ ok: true, folder }, { headers: readHeaders(req) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { id } = await params;
  if (!UUID.test(id)) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });

  let gone: boolean;
  try {
    gone = await deleteFolder(who.userId, id, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Deleting a folder failed");
  }
  if (!gone) return apiError(404, NOT_FOUND, undefined, { headers: readHeaders(req) });

  // The cards that were filed in it changed, so the cached rows are stale; so is the list.
  revalidateTag(cardsTag(who.userId), { expire: 0 });
  revalidateTag(foldersTag(who.userId), { expire: 0 });
  await forgetOnTheWeb(who);
  return NextResponse.json({ ok: true }, { headers: readHeaders(req) });
}
