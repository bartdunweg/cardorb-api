import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authorise, readHeaders, refused, storeErrorResponse } from "@/lib/api/guard";
import { bearer } from "@/lib/api/viewer";
import {
  findFolder,
  getCollection,
  getEarlyValue,
  getListValue,
  getRecentValue,
  getValueHistory,
} from "@/lib/core/collection/collection";
import { UUID } from "@/lib/core/collection/collection-row";
import { joinHistory, prependHistory } from "@/lib/core/collection/folder-history";
import { type CardItem, filterItems, flattenItems } from "@/lib/core/collection/items";
import { HISTORY_FROM, recentFrom } from "@/lib/core/collection/value-history";
import type { ValueSnapshot } from "@/lib/core/collection/value-snapshot";

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
 * The stored points answer every day they cover. Until now the last ninety days were summed from
 * the readings on every visit and drawn over them: 144,574 readings, 1,678 ms to read and 241 ms
 * to add up (production, 2026-09-17), for figures the table already held. It was also visibly
 * wrong at the seam. A copy sold is gone from the collection, so a line worked out today values
 * the past without it, while the points before the window keep it: the owner's line stepped from
 * EUR 41,471 on 2026-06-19 (stored) to EUR 41,424 on 2026-06-20 (worked out) where the stored
 * series rose EUR 30, and that notch walked a day forward every day. recentFrom() takes the
 * earliest day the table has no point for, so what is worked out is today and any night the cron
 * missed, and nothing is drawn over a point that already says it.
 *
 * Before the first stored point the line is worked out too, where that point is later than the
 * readings begin (HISTORY_FROM, 2024-02-08): what the account holds now, every copy at each day's
 * price whenever it was added (getEarlyValue). The owner's account was backfilled to that day and
 * asks nothing; an account whose points start the day its first card was added gets a line back to
 * the day its cards have prices from, instead of two points (Bart, 2026-09-19).
 *
 * `?folder=<id>`, `?folder=favorites` or `?folder=wishlist` answers for that list instead, built from
 * the per-card daily readings (see folderSeries) and kept as the line (getListValue): the same
 * shape, a shorter history, since the readings start where the nightly card prices do.
 *
 * Both branches answer 503 when the read behind them failed, and that used to
 * be true of one of them. The folder branch already refused to draw a line out
 * of a collection it could not read; the plain branch answered `200
 * {"snapshots": []}` — the payload that means "this account has never been
 * snapshotted" — for a store that was simply down. One route file, two answers
 * to the same question.
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
    const { snapshots, failed } = await getValueHistory(viewer.userId, token);
    if (failed)
      return unavailable(
        "The value history could not be read. Try again in a moment.",
        readHeaders(req),
      );
    /* The days the table has no point for, as the cards' own lines add up (joinHistory): the same
       readings a card's chart draws, summed once and kept (getRecentValue). For an account the
       04:00 cron has kept up with that is today alone; recentFrom() takes the earliest missing day,
       so a gap or a history the cron stopped writing is worked out and drawn rather than left to a
       stored point that does not cover it.

       And the days before the first point, where that is later than the readings begin
       (HISTORY_FROM): what the account holds now, at each day's prices (getEarlyValue), drawn before
       the stored points, which win every day they cover (prependHistory). Only the owner's account
       was backfilled to 2024-02-08; every other account's points start the day its first card was
       added, which drew a flat or two-point line. An account with no stored point at all has its
       early line end where the worked-out recent days begin.

       Where the collection or its readings cannot be read, each part falls back on its own: the
       stored points alone, as before, and the error logged. */
    const since = recentFrom(
      snapshots.map((p) => p.date),
      new Date().toISOString().slice(0, 10),
    );
    const firstStored = snapshots[0]?.date;
    const early = !firstStored || firstStored > HISTORY_FROM;
    let recent: ValueSnapshot[] = [];
    let before: ValueSnapshot[] = [];
    if (since || early) {
      let items: CardItem[] | null = null;
      try {
        const collection = await getCollection(viewer.userId, token);
        if (collection && !collection.failed) items = flattenItems(collection.sets);
      } catch (err) {
        console.error("Collection unavailable for the value line, the stored points alone:", err);
      }
      if (items) {
        const held = items;
        const readRecent = async () => {
          if (!since) return;
          try {
            const line = await getRecentValue(viewer.userId, held, token, since);
            if (!line.failed) recent = line.snapshots;
          } catch (err) {
            console.error("Recent value line unavailable, the stored points alone:", err);
          }
        };
        const readEarly = async (until: string | undefined) => {
          if (!early || !until || until <= HISTORY_FROM) return;
          try {
            const line = await getEarlyValue(
              viewer.userId,
              filterItems(held, { owned: true }),
              token,
              until,
            );
            if (!line.failed) before = line.snapshots;
          } catch (err) {
            console.error("Early value line unavailable, the stored points alone:", err);
          }
        };
        // Side by side where the first stored point is known; after the recent days where it is not.
        if (firstStored) await Promise.all([readRecent(), readEarly(firstStored)]);
        else {
          await readRecent();
          await readEarly(recent[0]?.date);
        }
      }
    }
    return NextResponse.json(
      { snapshots: prependHistory(before, joinHistory(snapshots, recent)) },
      { headers: readHeaders(req) },
    );
  }

  if (folder !== "favorites" && folder !== "wishlist" && !UUID.test(folder))
    return apiError(400, "folder must be a folder id, `favorites` or `wishlist`.", undefined, {
      headers: readHeaders(req),
    });
  let filter: Parameters<typeof filterItems>[1] =
    folder === "wishlist" ? { owned: false } : { owned: true, favorite: true };
  if (folder !== "favorites" && folder !== "wishlist") {
    // Wrapped like the identical call in cards/route.ts. Unwrapped, a store
    // that throws here left Next to write its own 500 — a status the contract
    // does not carry, in a body that is not `{ error: string }`, to two clients
    // that show the sentence and branch on the status.
    let found;
    try {
      found = await findFolder(viewer.userId, folder, token);
    } catch (err) {
      return storeErrorResponse(err, req, "Reading the folder failed");
    }
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
  const line = await getListValue(
    viewer.userId,
    items,
    folder === "wishlist" ? "wishlist" : "owned",
    token,
  );
  if (line.failed)
    return unavailable(
      "The value history could not be read. Try again in a moment.",
      readHeaders(req),
    );
  return NextResponse.json({ snapshots: line.snapshots }, { headers: readHeaders(req) });
}
