import { NextResponse } from "next/server";
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
import { cardsTag, UUID } from "@/lib/core/collection/collection-row";
import { validateFolderName } from "@/lib/core/collection/folders";
import { deleteFolder, renameFolder } from "@/lib/storage/collection";

const NOT_FOUND = { error: "No folder by that id." };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

  const { id } = await params;
  if (!UUID.test(id))
    return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });

  const read = await readJsonBody(req, BODY_LIMIT.folder);
  if (read.kind === "too-large")
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: readHeaders(req) },
    );
  if (read.kind === "invalid")
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: readHeaders(req) },
    );

  const name = validateFolderName((read.body as { name?: unknown })?.name);
  if (name.kind === "invalid")
    return NextResponse.json({ error: name.error }, { status: 400, headers: readHeaders(req) });

  let folder;
  try {
    folder = await renameFolder(who.userId, id, name.name, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Renaming a folder failed");
  }
  if (!folder) return NextResponse.json(NOT_FOUND, { status: 404, headers: readHeaders(req) });

  return NextResponse.json({ ok: true, folder }, { headers: readHeaders(req) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await authorise(req);
  if (refused(who))
    return NextResponse.json(
      { error: who.error },
      { status: who.status, headers: readHeaders(req) },
    );

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

  // The cards that were filed in it changed, so the cached rows are stale.
  revalidateTag(cardsTag(who.userId), { expire: 0 });
  return NextResponse.json({ ok: true }, { headers: readHeaders(req) });
}
