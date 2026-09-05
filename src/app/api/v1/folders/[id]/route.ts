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

const NOT_FOUND = { error: "No folder by that id." };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });

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
    if (!before) return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });
    if (body.body.rule && !before.rule)
      return apiError(400, "This folder is filled by hand; it cannot take a rule.", undefined, {
        headers: readHeaders(req),
      });
    folder = await updateFolder(who.userId, id, body.body, token);
  } catch (err) {
    return storeErrorResponse(err, req, "Changing a folder failed");
  }
  if (!folder) return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });

  revalidateTag(foldersTag(who.userId), { expire: 0 });
  return NextResponse.json({ ok: true, folder }, { headers: readHeaders(req) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });

  let gone: boolean;
  try {
    gone = await deleteFolder(who.userId, id, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Deleting a folder failed");
  }
  if (!gone) return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });

  // The cards that were filed in it changed, so the cached rows are stale; so is the list.
  revalidateTag(cardsTag(who.userId), { expire: 0 });
  revalidateTag(foldersTag(who.userId), { expire: 0 });
  return NextResponse.json({ ok: true }, { headers: readHeaders(req) });
}
