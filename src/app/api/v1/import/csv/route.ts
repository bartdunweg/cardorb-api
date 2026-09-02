import { NextResponse } from "next/server";
import { readJsonBody, BODY_LIMIT } from "@/lib/api/body";
import { refuse } from "@/lib/api/respond";
import { revalidateTag } from "next/cache";
import { sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { currentViewer } from "@/lib/api/viewer";
import { serverClient } from "@/lib/storage/supabase";
import { cardsTag } from "@/lib/core/collection/collection-row";
import { parseCsv, guessColumns, rowsFrom, type ColumnMap } from "@/lib/core/collection/csv";
import { commit, preview } from "@/lib/storage/imports";

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
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let csv = "";
  let map: Partial<ColumnMap> | undefined;
  let doCommit = false;
  const read = await readJsonBody<{ csv?: unknown; map?: unknown; commit?: unknown }>(
    req,
    BODY_LIMIT.csv,
  );
  if (read.kind === "too-large")
    return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  if (read.kind === "invalid")
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = read.body;
  if (typeof body.csv === "string") csv = body.csv;
  if (body.map && typeof body.map === "object") map = body.map as Partial<ColumnMap>;
  doCommit = body.commit === true;

  // After the body is read, because the flag deciding whether this call is
  // expensive is in it. A preview is not counted; see the note on byAccount.
  if (doCommit && byAccount(viewer.userId)) {
    return NextResponse.json({ error: "Too many imports. Try again shortly." }, { status: 429 });
  }

  if (!csv.trim()) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (csv.length > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  }

  const grid = parseCsv(csv);
  if (!grid.length)
    return NextResponse.json({ error: "Nothing could be read from that file." }, { status: 400 });
  if (grid.length > MAX_ROWS + 1) {
    return NextResponse.json(
      { error: `That file has more than ${MAX_ROWS} rows.` },
      { status: 413 },
    );
  }

  const header = grid[0]!;
  const guessed = { ...guessColumns(header), ...map };

  // Two columns are not optional: without them a row cannot be placed or drawn,
  // so the whole file would import as nothing.
  if (guessed.name === undefined || guessed.set === undefined) {
    return NextResponse.json(
      {
        error: "Point out which columns hold the card name and the set.",
        header,
        guessed,
      },
      { status: 400 },
    );
  }

  const { rows, skipped } = rowsFrom(grid, guessed as ColumnMap);

  if (!doCommit) {
    return NextResponse.json({
      ...preview(rows, skipped.length),
      header,
      guessed,
      skippedRows: skipped.slice(0, 20),
    });
  }

  const db = await serverClient();
  if (!db) {
    return refuse("noDatabase");
  }

  try {
    const outcome = await commit(db, viewer.userId, "csv", rows, skipped.length);
    // The rows are cached for an hour. Without this a successful import shows
    // nothing until it expires, which reads as a failed import.
    revalidateTag(cardsTag(viewer.userId), { expire: 0 });
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("CSV import failed:", err);
    return NextResponse.json({ error: "That import could not be finished." }, { status: 500 });
  }
}
