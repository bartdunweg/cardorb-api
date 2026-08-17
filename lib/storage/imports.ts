import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectionRow } from "../core/collection-row";
import { createRows } from "./postgres";

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

export type ImportOutcome = {
  seen: number;
  added: number;
  skipped: number;
  /** A few rows as they will be stored, so a person can check before committing. */
  sample: CollectionRow[];
};

/** What a dry run reports. Writes nothing, opens no transaction. */
export function preview(rows: CollectionRow[], skipped: number): ImportOutcome {
  return { seen: rows.length + skipped, added: 0, skipped, sample: rows.slice(0, 5) };
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
 */
export async function commit(
  db: SupabaseClient,
  userId: string,
  kind: "csv",
  rows: CollectionRow[],
  skippedCount: number,
): Promise<ImportOutcome> {
  const { data: started } = await db
    .from("imports")
    .insert({ kind, status: "running", rows_seen: rows.length + skippedCount })
    .select("id")
    .single();

  const id = (started as { id: string } | null)?.id;

  try {
    const { added } = await createRows(db, userId, rows, kind);

    if (id) {
      await db
        .from("imports")
        .update({
          status: "done",
          rows_added: added,
          rows_skipped: rows.length - added + skippedCount,
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    return {
      seen: rows.length + skippedCount,
      added,
      skipped: rows.length - added + skippedCount,
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
