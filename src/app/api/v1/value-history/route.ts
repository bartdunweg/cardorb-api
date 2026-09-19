import { NextResponse, after } from "next/server";
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
import { earlyUntil, joinHistory, withEarlyLine } from "@/lib/core/collection/folder-history";
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

/**
 * How long Home waits for the line before the first stored point. A kept line is 32 Data Cache
 * reads and a sum; a cold one is seconds, and is finished after the response instead.
 */
const EARLY_WAIT_MS = 1500;

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
       the stored points (withEarlyLine). Only the owner's account was backfilled to 2024-02-08;
       every other account's points start the day its first card was added, which drew a flat or
       two-point line. A stored point wins the day it covers unless it is an import's dip, a night
       that held under half of what has a price that day (replacesStored), which the worked-out day
       replaces; the early line then reaches past the first point to the last such night
       (earlyUntil). An account with no stored point at all has its early line cut where the
       worked-out recent days begin.

       Home does not wait for an early line that is not kept yet. Read cold it is every held card's
       readings since 2024: 7 s for two thousand cards (getEarlyValue). The route waits
       EARLY_WAIT_MS for it, which a kept line answers well within, and otherwise answers the stored
       and recent points at once and lets the read finish after the response (after()), so its parts
       are kept for the next request.

       Where the collection or its readings cannot be read, each part falls back on its own: the
       stored points alone, as before, and the error logged. */
    const today = new Date().toISOString().slice(0, 10);
    const since = recentFrom(
      snapshots.map((p) => p.date),
      today,
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
        const owned = filterItems(held, { owned: true });
        /* With no stored point the early line is built to today, a key that holds for the day
           (recent[0] need not: a copy with no date moves it with the window), and withEarlyLine
           cuts it where the recent days begin. The cron stores the first point the next night. */
        const until = early
          ? (earlyUntil(
              snapshots,
              owned.reduce((n, it) => n + Math.max(0, it.quantity), 0),
            ) ?? today)
          : null;
        const readEarly = async (): Promise<ValueSnapshot[]> => {
          if (!until || until <= HISTORY_FROM) return [];
          try {
            const line = await getEarlyValue(viewer.userId, owned, token, until);
            return line.failed ? [] : line.snapshots;
          } catch (err) {
            console.error("Early value line unavailable, the stored points alone:", err);
            return [];
          }
        };
        const earlyRead = readEarly();
        await readRecent();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const waited = await Promise.race([
          earlyRead,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), EARLY_WAIT_MS);
          }),
        ]);
        clearTimeout(timer);
        if (waited) before = waited;
        else {
          console.info("[timing] early-value not kept yet, finished after the response");
          after(earlyRead);
        }
      }
    }
    return NextResponse.json(
      { snapshots: withEarlyLine(before, joinHistory(snapshots, recent)) },
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
