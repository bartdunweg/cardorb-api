import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionRow } from "../core/collection/collection-row";
import { NOT_OWNED } from "../core/collection/csv";
import { importKey, splitExisting, type TitleOf } from "../core/collection/import-match";
import { setCatalogue } from "../core/catalogue/catalogue";
import { mapLimit } from "../core/util";
import { createRows, pageRange, readAllPages } from "./postgres";

/**
 * Running an import, and writing down that it ran.
 *
 * The `imports` table also holds `kind: "notion"` rows from the one-time
 * Notion→Postgres migration, which is why the database column still allows
 * that value even though nothing writes it anymore.
 *
 * An import is the only operation in this app that can be surprising after
 * the fact. "It says 1,204 added and I have 1,600 cards" is a question that
 * needs an answer, and the answer is a row with counts on it.
 */

/** One row that was not written, with the line a person would count to. */
export type SkippedRow = { line: number; why: string };

export type ImportOutcome = {
  seen: number;
  added: number;
  skipped: number;
  /**
   * Of `skipped`, the rows left out because the file says the card is not
   * owned. Told apart from the rest because they are not a problem: an export
   * from Dex lists every printing of every set it has ever shown you, and on a
   * real file this is more than half the lines. Calling those "could not be
   * used" reads as an import that half failed.
   */
  notOwned: number;
  /**
   * Rows naming a card the collection already holds. Reported, not acted on:
   * every row is written. It is here so a screen can say "93 of these you
   * already have" before somebody imports the same file for the second time,
   * which is the way this operation goes wrong.
   */
  existing: number;
  /** A few rows as they will be stored, so a person can check before committing. */
  sample: CollectionRow[];
};

/**
 * Every card the collection already holds, as import keys.
 *
 * Read once per request and handed to both halves below, because a preview and
 * the commit that follows it must answer the same question — a preview that
 * promised to skip 696 and a commit that skipped a different number would make
 * the preview a lie.
 *
 * Three columns of every row: for a collection of a few thousand that is one
 * indexed read of a few hundred kilobytes, and it is the only way to know what
 * is already there without asking the database once per line.
 *
 * Paged, and counted first, for the reason listRows is: PostgREST caps a
 * response at a thousand rows and announces it by handing over a thousand rows.
 * Unpaged, a collection of 1,634 answered with an arbitrary thousand of them —
 * so the preview under-counted what it already held by a third and the commit
 * agreed with it, which is the one number standing between a person and a
 * doubled collection. A CSV row carries no source_id, so the unique index never
 * catches the second copy.
 *
 * Through readAllPages() rather than its own loop, which is what this was: the
 * fourth copy of the same twenty lines, and the one that quietly dropped the
 * truncation check the other three keep. It now throws on a short read like
 * they do — which is right here more than anywhere, since a short read is
 * exactly how a collection gets imported twice.
 */
type Row = { name?: string; set_name?: string; number?: string };

/**
 * The official name of every set named, by the name it was named.
 *
 * The same cached read the collection view makes for a set (setCatalogue, a
 * day), eight at a time as cards.ts asks it. A set the catalogue does not know,
 * or cannot be asked about right now, goes by the name given: the outage that
 * serves the collection from the rows alone must not stop an import, and a
 * count that is right for every set but one beats no count.
 */
export async function officialTitles(setNames: Iterable<string>): Promise<TitleOf> {
  const names = [...new Set(setNames)].filter((n) => n.trim());
  const titles = new Map<string, string>();
  await mapLimit(names, 8, async (name) => {
    try {
      const title = (await setCatalogue(name)).officialName;
      if (title) titles.set(name, title);
    } catch {
      // Unknown or unreachable: the filing name stands, see above.
    }
  });
  return (name) => titles.get(name) ?? name;
}

/**
 * The keys of what is held, and the fold both sides are keyed through.
 *
 * `alsoFold` is the file's set names: the fold has to know those too, or a
 * file saying "Base Set" would be compared against rows folded to "Base Set"
 * under its own unfolded name and miss.
 */
export async function heldKeys(
  db: SupabaseClient,
  userId: string,
  alsoFold: Iterable<string> = [],
): Promise<{ keys: Set<string>; titleOf: TitleOf }> {
  const rows = await readAllPages<Row>("the collection", (page, counted) =>
    db
      .from("cards")
      .select("name,set_name,number", counted ? { count: "exact" } : {})
      // A total order, so the pages are disjoint: id alone is unique and enough.
      .order("id", { ascending: true })
      .eq("user_id", userId)
      .range(...pageRange(page)),
  );

  const titleOf = await officialTitles([...rows.map((row) => row.set_name ?? ""), ...alsoFold]);
  return {
    keys: new Set(
      rows.map((row) =>
        importKey(
          {
            name: row.name ?? "",
            setName: row.set_name ?? "",
            number: row.number ?? "",
          },
          titleOf,
        ),
      ),
    ),
    titleOf,
  };
}

/**
 * What a dry run reports. Writes nothing and opens no transaction.
 *
 * It reads now, which the older note here said it did not: without knowing what
 * the collection already holds there is no honest number to put in front of
 * somebody before an operation that cannot be undone.
 */
export function preview(
  rows: CollectionRow[],
  skipped: SkippedRow[],
  held: ReadonlySet<string>,
  titleOf?: TitleOf,
): ImportOutcome {
  const { existing } = splitExisting(rows, held, titleOf);
  return {
    seen: rows.length + skipped.length,
    added: 0,
    skipped: skipped.length,
    notOwned: skipped.filter((s) => s.why === NOT_OWNED).length,
    existing: existing.length,
    /*
     * Twenty rows, not five. Five was a glimpse: it showed the first cards of a
     * 2,000-row file and left the reader trusting the count. Twenty is what
     * every import screen on Mobbin shows (Pipedrive says so in words), enough
     * to see the set names and printings come through right, and still one
     * request; the screen says how many more there are.
     */
    sample: rows.slice(0, 20),
  };
}

/**
 * The committing half.
 *
 * The order matters and each step is here for a reason found the hard way:
 * the `imports` row is written *first* and marked running, so an import that
 * dies halfway leaves a record saying so rather than no record at all; the
 * counts come from createRows, which counts the table before and after because
 * an ignoreDuplicates upsert reports nothing; and the cache tag is dropped at
 * the end, because the rows are held for an hour and a successful import that
 * shows nothing for an hour reads as a failed one.
 *
 * **Every row is written, including the ones naming a card already held.** A
 * file is a list of copies somebody has, and a second copy of a card is a
 * normal thing to own — the check that would skip them cannot tell a duplicate
 * from a second printing, because a finish is not part of the key and a
 * collection filled from Notion mostly has none. Refusing the row would lose a
 * card silently; writing it costs nothing, because createRows() then folds every
 * row that is the same kind as one held into that row — one more of it.
 *
 * What that leaves is the real danger, and it is untouched: cards_source_idx is
 * unique on a source_id that a CSV row does not have, and NULLs never collide,
 * so importing the same file twice writes everything twice and nothing stops
 * it. `existing` is reported so the screen can say so out loud beforehand.
 */
export async function commit(
  db: SupabaseClient,
  userId: string,
  kind: "csv",
  rows: CollectionRow[],
  skippedRows: SkippedRow[],
  held: ReadonlySet<string>,
  titleOf?: TitleOf,
): Promise<ImportOutcome> {
  const { existing } = splitExisting(rows, held, titleOf);
  const skippedCount = skippedRows.length;

  // The error was being discarded here. If this insert is refused the import
  // still runs and still writes every card, but no record of it is ever made:
  // the history screen shows nothing, and a run that then dies halfway leaves
  // the one thing this row exists to leave behind — a trace — missing. It is
  // not worth refusing the import over, so it is logged and the run goes on
  // without an id, which the calls below already tolerate.
  const { data: started, error: startError } = await db
    .from("imports")
    .insert({ kind, status: "running", rows_seen: rows.length + skippedCount })
    .select("id")
    .single();
  if (startError) console.error("Import started with no record of it:", startError.message);

  const id = (started as { id: string } | null)?.id;

  try {
    const { added } = await createRows(db, userId, rows, kind);
    const skipped = rows.length - added + skippedCount;

    if (id) {
      await db
        .from("imports")
        .update({
          status: "done",
          rows_added: added,
          rows_skipped: skipped,
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    return {
      seen: rows.length + skippedCount,
      added,
      skipped,
      notOwned: skippedRows.filter((s) => s.why === NOT_OWNED).length,
      existing: existing.length,
      sample: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (id) {
      // A row left saying "running" forever is worse than one saying "failed":
      // the screen cannot tell a crash from something still in progress.
      await db
        .from("imports")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", id);
    }
    throw err;
  }
}

/**
 * The last few runs, for the screen that asks what happened.
 *
 * `imports_own` RLS already restricts this to the caller's own rows; the
 * `.eq("user_id", ...)` here is belt-and-braces, matching the rest of this
 * file, so a dropped or misconfigured policy fails closed instead of quietly
 * returning everyone's history.
 */
export async function recentImports(db: SupabaseClient, userId: string, limit = 10) {
  const { data, error } = await db
    .from("imports")
    .select("id,kind,status,rows_seen,rows_added,rows_skipped,error,started_at,finished_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Reading the import history failed: ${error.message}`);
  return data ?? [];
}
