import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { apiError, retryAfter } from "@/lib/api/respond";
import { revalidateTag } from "next/cache";
import { authoriseWrite, refused } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { bearer } from "@/lib/api/viewer";
import { clientFor } from "@/lib/storage/collection";
import { cardsTag } from "@/lib/core/collection/collection-row";
import { parseCsv, guessColumns, rowsFrom, type ColumnMap } from "@/lib/core/collection/csv";
import { looksLikeDex, dexRows } from "@/lib/core/collection/dex";
import { commit, heldKeys, preview } from "@/lib/storage/imports";
import type { TitleOf } from "@/lib/core/collection/import-match";

import { forgetOnTheWeb } from "@/lib/api/web-cache";
/**
 * A spreadsheet, previewed or committed.
 *
 * One endpoint with a flag rather than two: show me what you would do, then
 * do it.
 *
 * A preview writes nothing and opens no transaction. It exists because a
 * destructive-looking operation with no preview is a trap — and because the
 * column mapping is a *guess*, so the only honest thing to do is show what the
 * guess produced before acting on it.
 *
 * Two kinds of file reach here. One is somebody's own list, whose headers can
 * only be guessed at and corrected on screen. The other is an export from a
 * collection app, where the columns are fixed and three of them mean things no
 * column map can express — see dex.ts. The answer says which of the two this
 * was, under `source`, so the screen can stop asking a question whose answer is
 * not in doubt.
 */

/** Two megabytes and five thousand rows. A collection, not a database dump. */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5_000;

export const maxDuration = 300;

/**
 * Ten commits per account per fifteen minutes. Previews are not counted.
 *
 * This is the most expensive route in the app — up to five thousand inserts and
 * five minutes of function time per call — and being signed in was its only
 * throttle. The same limiter is on /email and /password on lighter
 * reasoning: one external Auth call per request was judged worth it, and this
 * was not reached in that pass.
 *
 * Keyed on the account, not the address: the cost being limited is database
 * writes, which belong to a user rather than to a network. A preview writes
 * nothing and opens no transaction, and it is the half a person repeats while
 * fixing a column mapping, so limiting it would punish the careful path.
 */
const byAccount = createRateLimiter(15 * 60_000, 10);

export async function POST(req: Request) {
  /**
   * authoriseWrite(), not sameOrigin() + currentViewer().
   *
   * currentViewer() reads the session from a cookie, which means a browser on
   * this origin and nothing else. The web app calls this from its own server
   * with the session as a bearer token, the way the iOS app does and the way
   * every other write route here already accepts — so this endpoint existed,
   * worked, and answered 401 to the only client that wanted it.
   */
  const viewer = await authoriseWrite(req);
  if (refused(viewer)) {
    return apiError(viewer.status, viewer.error, undefined, { headers: viewer.headers });
  }

  let csv = "";
  let map: Partial<ColumnMap> | undefined;
  let doCommit = false;
  /**
   * Lines the caller struck off, by the number a person counts to in their own
   * file. Line numbers rather than indices into the answer: the same file and
   * the same column map parse to the same lines every time, so a selection
   * made against a preview still means what it said when the commit arrives,
   * and it survives a client that sorted or filtered what it drew.
   */
  let exclude: ReadonlySet<number> = new Set();
  const read = await readJsonBody<{
    csv?: unknown;
    map?: unknown;
    commit?: unknown;
    exclude?: unknown;
  }>(req, BODY_LIMIT.csv);
  if (read.kind === "too-large") return apiError(413, "That file is too large.");
  if (read.kind === "invalid") return apiError(400, "Invalid request");
  const body = read.body;
  if (typeof body.csv === "string") csv = body.csv;
  if (body.map && typeof body.map === "object") map = body.map as Partial<ColumnMap>;
  doCommit = body.commit === true;
  if (Array.isArray(body.exclude)) {
    exclude = new Set(
      body.exclude.filter((n): n is number => typeof n === "number" && Number.isInteger(n)),
    );
  }

  // After the body is read, because the flag deciding whether this call is
  // expensive is in it. A preview is not counted; see the note on byAccount.
  const wait = doCommit ? byAccount(viewer.userId) : 0;
  if (wait) {
    return apiError(429, "Too many imports. Try again shortly.", undefined, {
      headers: retryAfter(wait),
    });
  }

  if (!csv.trim()) return apiError(400, "That file is empty.");
  if (csv.length > MAX_BYTES) {
    return apiError(413, "That file is too large.");
  }

  const grid = parseCsv(csv);
  if (!grid.length) return apiError(400, "Nothing could be read from that file.");
  if (grid.length > MAX_ROWS + 1) {
    return NextResponse.json(
      { error: `That file has more than ${MAX_ROWS} rows.` },
      { status: 413 },
    );
  }

  const header = grid[0]!;
  const dex = looksLikeDex(header);
  const guessed = dex ? undefined : { ...guessColumns(header), ...map };

  // Two columns are not optional: without them a row cannot be placed or drawn,
  // so the whole file would import as nothing. A recognised export is never
  // asked, because its columns are not in question.
  if (guessed && (guessed.name === undefined || guessed.set === undefined)) {
    return NextResponse.json(
      {
        error: "Point out which columns hold the card name and the set.",
        header,
        guessed,
        source: "generic",
      },
      { status: 400 },
    );
  }

  const parsed = dex ? dexRows(grid) : rowsFrom(grid, guessed as ColumnMap);
  const { skipped } = parsed;

  /*
   * The caller's ticking, applied here and nowhere else: everything downstream
   * sees the rows that are actually going to be written, so no count has to
   * remember to subtract. A line that was never writable in the first place
   * cannot be struck off, so `excluded` counts only rows this dropped.
   */
  const kept = parsed.rows
    .map((row, i) => ({ row, line: parsed.lines[i]! }))
    .filter((r) => !exclude.has(r.line));
  const rows = kept.map((k) => k.row);
  const excluded = parsed.rows.length - rows.length;

  /**
   * What the collection already holds, read before either half answers.
   *
   * The preview needs it to make its promise and the commit needs it to keep
   * that promise, so both are handed the same answer from the same read.
   */
  const db = await clientFor(bearer(req) ?? undefined);
  if (!db) return apiError(503, "There is nowhere to write to.");

  // Keyed through the sets' official names on both sides, so a card held under the name
  // it was filed with in Notion counts as held when the file says the catalogue's name.
  let held: Set<string>;
  let titleOf: TitleOf;
  try {
    ({ keys: held, titleOf } = await heldKeys(
      db,
      viewer.userId,
      // Only the rows with no catalogue id: the rest are recognised by it. See heldKeys().
      rows.filter((r) => !r.tcgId).map((r) => r.setName),
    ));
  } catch (err) {
    console.error("Reading the collection before an import failed:", err);
    return apiError(502, "Your collection could not be read.");
  }

  const source = dex ? "dex" : "generic";

  if (!doCommit) {
    return NextResponse.json({
      ...preview(rows, skipped, held, titleOf),
      header,
      guessed,
      source,
      skippedRows: skipped.slice(0, 20),
      /*
       * Every row that would be written, not the twenty of `sample`.
       *
       * `sample` is a glimpse to check the parse by; this is the list itself,
       * so a client can put a tick beside each row and hand the unticked lines
       * back. It is the same rows in the same order, each with the line it came
       * from, and it is capped by MAX_ROWS like everything else here.
       */
      rows: kept.map(({ row, line }) => ({
        line,
        name: row.name,
        number: row.number,
        setName: row.setName,
        rarity: row.rarity,
        owned: row.owned,
        quantity: row.quantity,
        finish: row.finish,
        foilPattern: row.foilPattern,
        edition: row.edition,
      })),
    });
  }

  try {
    const outcome = await commit(db, viewer.userId, "csv", rows, skipped, held, titleOf, excluded);
    // The rows are cached for an hour. Without this a successful import shows
    // nothing until it expires, which reads as a failed import.
    revalidateTag(cardsTag(viewer.userId), { expire: 0 });
    await forgetOnTheWeb(viewer);
    return NextResponse.json({ ...outcome, source });
  } catch (err) {
    console.error("CSV import failed:", err);
    return apiError(500, "That import could not be finished.");
  }
}
