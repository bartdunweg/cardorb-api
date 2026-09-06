import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/respond";
import { authorise, readHeaders, refused } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import {
  findFolder,
  getCardPrices,
  getCollection,
  getValueHistory,
} from "@/lib/core/collection/collection";
import { UUID } from "@/lib/core/collection/collection-row";
import { folderSeries } from "@/lib/core/collection/folder-history";
import { filterItems, flattenItems } from "@/lib/core/collection/items";

/**
 * What the caller's collection has been worth, oldest reading first.
 *
 * The response shape is unchanged — `{ snapshots: [{date, value, cards, priced,
 * unpriced}] }`, values in whole euros — because the iOS app reads it and this
 * change is about whose numbers those are, not what they look like. It used to
 * import lib/core/collection-value.generated.json and hand the identical series
 * to every authenticated caller; see getValueHistory in lib/core/collection/collection.ts
 * for what that was and why it is a per-user table now.
 *
 * The bearer is forwarded for the same reason /v1/collection forwards it: row
 * level security has to see the caller who is actually asking, and this table's
 * only policy is `user_id = auth.uid()`.
 *
 * `?folder=<id>`, `?folder=favorites` or `?folder=wishlist` answers for that list instead, built from
 * the per-card daily readings (see folderSeries): the same shape, a shorter
 * history, since the readings start where the nightly card prices do.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await authorise(req);
  if (refused(viewer))
    return apiError(viewer.status, viewer.error, undefined, {
      headers: { ...readHeaders(req), ...viewer.headers },
    });

  const token = bearer(req) ?? undefined;
  const folder = new URL(req.url).searchParams.get("folder");
  if (!folder) {
    const snapshots = await getValueHistory(viewer.userId, token);
    return NextResponse.json({ snapshots }, { headers: readHeaders(req) });
  }

  if (folder !== "favorites" && folder !== "wishlist" && !UUID.test(folder))
    return apiError(400, "folder must be a folder id, `favorites` or `wishlist`.", undefined, {
      headers: readHeaders(req),
    });
  let filter: Parameters<typeof filterItems>[1] =
    folder === "wishlist" ? { owned: false } : { owned: true, favorite: true };
  if (folder !== "favorites" && folder !== "wishlist") {
    const found = await findFolder(viewer.userId, folder, token);
    if (!found)
      return apiError(404, "No folder by that id.", undefined, { headers: readHeaders(req) });
    filter = found.rule ? { rule: found.rule } : { owned: true, collection: folder };
  }
  const { sets, failed } = await getCollection(viewer.userId, token);
  if (failed)
    return apiError(503, "The collection is unavailable.", undefined, {
      headers: readHeaders(req),
    });
  const items = filterItems(flattenItems(sets), filter);
  const ids = [...new Set(items.flatMap((it) => (it.tcgId ? [it.tcgId] : [])))];
  const prices = await getCardPrices(viewer.userId, ids, token);
  return NextResponse.json(
    { snapshots: folderSeries(items, prices, folder === "wishlist" ? "wishlist" : "owned") },
    { headers: readHeaders(req) },
  );
}
