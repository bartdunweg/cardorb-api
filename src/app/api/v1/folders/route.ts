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
import { getRows } from "@/lib/core/collection/collection";
import { cardsTag } from "@/lib/core/collection/collection-row";
import { validateFolderName } from "@/lib/core/collection/folders";
import { createFolder, listFolders } from "@/lib/storage/collection";

export const dynamic = "force-dynamic";

/**
 * Folders: the ones a person made to sort their cards into. "Collection" means
 * the whole of what they own everywhere else in this API, so these are folders
 * here even though the web app's copy says collections.
 */
export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, { headers: readHeaders(req) });

  const token = bearer(req) ?? undefined;
  let folders;
  try {
    folders = await listFolders(who.userId, token);
  } catch (err) {
    return storeErrorResponse(err, req, "Listing folders failed");
  }

  // How many copies are filed in each, from the cached rows rather than a
  // count query per folder.
  const { rows } = await getRows(who.userId, token);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.collectionId && row.owned)
      counts.set(row.collectionId, (counts.get(row.collectionId) ?? 0) + 1);
  }

  return NextResponse.json(
    { folders: folders.map((f) => ({ ...f, count: counts.get(f.id) ?? 0 })) },
    { headers: readHeaders(req) },
  );
}

export async function POST(req: Request) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, { headers: readHeaders(req) });

  const read = await readJsonBody(req, BODY_LIMIT.folder);
  if (read.kind === "too-large")
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  if (read.kind === "invalid")
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });

  const name = validateFolderName((read.body as { name?: unknown })?.name);
  if (name.kind === "invalid")
    return apiError(400, name.error, undefined, { headers: readHeaders(req) });

  let folder;
  try {
    folder = await createFolder(who.userId, name.name, bearer(req) ?? undefined);
  } catch (err) {
    return storeErrorResponse(err, req, "Creating a folder failed");
  }

  revalidateTag(cardsTag(who.userId), { expire: 0 });
  return NextResponse.json(
    { ok: true, folder: { ...folder, count: 0 } },
    { headers: readHeaders(req) },
  );
}
