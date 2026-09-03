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
import { getCollection, getFolders } from "@/lib/core/collection/collection";
import { foldersTag } from "@/lib/core/collection/collection-row";
import { readFolderBody, ruleMatcher } from "@/lib/core/collection/folders";
import { flattenItems } from "@/lib/core/collection/items";
import { createFolder } from "@/lib/storage/collection";

export const dynamic = "force-dynamic";

/**
 * Folders: the ones a person made to sort their cards into. "Collection" means
 * the whole of what they own everywhere else in this API, so these are folders
 * here even though the web app's copy says collections.
 */
export async function GET(req: Request) {
  const who = await authorise(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const token = bearer(req) ?? undefined;
  let folders;
  try {
    folders = await getFolders(who.userId, token);
  } catch (err) {
    return storeErrorResponse(err, req, "Listing folders failed");
  }

  // How many copies each holds, from the cached assembly rather than a count query per
  // folder: filed copies for a folder filled by hand, matching copies for one with a rule
  // (a dex rule needs speciesId, which only the assembled item carries). A collection that
  // cannot be read counts nothing rather than failing the list; the sidebar tolerates that.
  // During a TCGdex outage the assembly has no speciesId and no catalogue titles, so a rule
  // count is low; the flag rides along so a client can say so.
  // When the rows themselves could not be read every count is 0, and `collectionUnavailable`
  // says that is why, not that the folders are empty.
  const { sets, failed, catalogueUnavailable } = await getCollection(who.userId, token);
  const items = failed ? [] : flattenItems(sets);
  const filed = new Map<string, number>();
  for (const it of items) {
    if (it.collectionId && it.owned)
      filed.set(it.collectionId, (filed.get(it.collectionId) ?? 0) + 1);
  }
  const count = (f: (typeof folders)[number]) => {
    if (!f.rule) return filed.get(f.id) ?? 0;
    const inRule = ruleMatcher(f.rule);
    let n = 0;
    for (const it of items) if (inRule(it)) n += 1;
    return n;
  };

  return NextResponse.json(
    {
      folders: folders.map((f) => ({ ...f, count: count(f) })),
      ...(catalogueUnavailable ? { catalogueUnavailable } : {}),
      ...(failed ? { collectionUnavailable: true } : {}),
    },
    { headers: readHeaders(req) },
  );
}

export async function POST(req: Request) {
  const who = await authoriseWrite(req);
  if (refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const read = await readJsonBody(req, BODY_LIMIT.folder);
  if (read.kind === "too-large")
    return apiError(413, "Payload too large", undefined, { headers: readHeaders(req) });
  if (read.kind === "invalid")
    return apiError(400, "Invalid request", undefined, { headers: readHeaders(req) });

  const body = readFolderBody(read.body, "create");
  if (body.kind === "invalid")
    return apiError(400, body.error, undefined, { headers: readHeaders(req) });
  // The reader requires the name on create.
  const name = body.body.name ?? "";

  let folder;
  try {
    folder = await createFolder(
      who.userId,
      name,
      body.body.rule ?? null,
      body.body.pokedex ?? null,
      bearer(req) ?? undefined,
    );
  } catch (err) {
    return storeErrorResponse(err, req, "Creating a folder failed");
  }

  // The folder list only: a new folder changes no row, and the assembled collection under
  // cardsTag is the expensive one to rebuild (every row against the catalogues, twenty seconds
  // for a large binder). Deleting a folder does unfile rows and drops both.
  revalidateTag(foldersTag(who.userId), { expire: 0 });
  return NextResponse.json(
    { ok: true, folder: { ...folder, count: 0 } },
    { headers: readHeaders(req) },
  );
}
