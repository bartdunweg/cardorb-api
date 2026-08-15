import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { sameOrigin } from "../../../../../lib/api/guard";
import { currentViewer } from "../../../../../lib/api/viewer";
import { serverClient } from "../../../../../lib/storage/supabase";
import { cardsTag } from "../../../../../lib/core/collection-row";
import { parseCsv, guessColumns, rowsFrom, type ColumnMap } from "../../../../../lib/core/csv";
import { commit, preview } from "../../../../../lib/storage/imports";

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

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let csv = "";
  let map: Partial<ColumnMap> | undefined;
  let doCommit = false;
  try {
    const body = (await req.json()) as { csv?: unknown; map?: unknown; commit?: unknown };
    if (typeof body.csv === "string") csv = body.csv;
    if (body.map && typeof body.map === "object") map = body.map as Partial<ColumnMap>;
    doCommit = body.commit === true;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!csv.trim()) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (csv.length > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  }

  const grid = parseCsv(csv);
  if (!grid.length) return NextResponse.json({ error: "Nothing could be read from that file." }, { status: 400 });
  if (grid.length > MAX_ROWS + 1) {
    return NextResponse.json({ error: `That file has more than ${MAX_ROWS} rows.` }, { status: 413 });
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
    return NextResponse.json({ ...preview(rows, skipped.length), header, guessed, skippedRows: skipped.slice(0, 20) });
  }

  const db = await serverClient();
  if (!db) {
    return NextResponse.json({ error: "This deployment has no database configured." }, { status: 503 });
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
