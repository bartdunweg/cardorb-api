/**
 * Where the collection is kept, and the one place that decides.
 *
 * Three verbs, and every store has to offer the same three: list the rows,
 * write one, say what the options are. Above this nothing knows which store
 * answered — lib/core/cards.ts takes rows and matches them against three
 * catalogues, and it would do the same work if they arrived by carrier pigeon.
 *
 * COLLECTION_SOURCE is what picks, and it defaults to notion, which is the
 * whole shape of this migration: a deployment that has not moved yet does not
 * have to say anything, and moving is one variable rather than a release. The
 * rollback is the same variable, which is why it is a variable at all.
 *
 * Fails soft on the read, like everything else that faces the page: no token
 * and there is no collection, which renders an empty state rather than an
 * error. The write does not get that: a read that fails loses nothing and a
 * write that fails quietly loses the card somebody just pulled.
 */

import type { CardDraft, CardFields, CollectionRow } from "../core/collection-row";
import * as notion from "./notion";
import * as postgres from "./postgres";
import { readClient, serverClient } from "./supabase";

export type Source = "notion" | "postgres";

/**
 * Which store is authoritative right now.
 *
 * Read per call rather than resolved at import, because a module-level constant
 * is a constant for the life of the process and this is the switch that gets
 * flipped while something is watching. Reading it costs nothing and means the
 * flip does not need a redeploy to be observed.
 */
export function source(): Source {
  return process.env.COLLECTION_SOURCE?.trim() === "postgres" ? "postgres" : "notion";
}

/**
 * Every row the caller may see, or none where this deployment has no store.
 *
 * `userId` narrows to one person's collection and is only for the public page,
 * which reads somebody else's. Left out, the policies decide, which for a
 * signed-in caller means their own rows. It is ignored on Notion, where there
 * is one collection and no such question.
 */
export async function listRows(userId?: string): Promise<CollectionRow[]> {
  if (source() === "postgres") {
    // The anonymous client, not the cookie-bound one. This read is called from
    // inside unstable_cache in lib/core/collection.ts, where `cookies()` is
    // both refused by the framework and wrong on its own terms — see the note
    // on readClient(). What comes back is what a signed-out visitor may see,
    // which is what every page that caches its collection is showing.
    const db = readClient();
    // Same fail-soft as a missing Notion token: a deployment either has a
    // database or it does not, and this is what keeps CI building with no
    // secrets at all.
    if (!db) return [];
    return postgres.listRows(db, userId);
  }
  const token = process.env.NOTION_TOKEN;
  // Not a failure, and the one empty worth remembering: a deployment either has
  // the token or it does not, and it will not acquire one mid-process.
  if (!token) return [];
  return notion.listRows(token);
}

/** Writes one card and returns the store's id for it. */
export async function createRow(draft: CardDraft): Promise<string> {
  if (source() === "postgres") {
    const db = await serverClient();
    if (!db) throw new Error("No database is connected here.");
    return postgres.createRow(db, draft);
  }
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Notion is not connected here.");
  return notion.createRow(draft, token);
}

/** What the form should offer in its four selects. */
export async function optionsFor(): Promise<CardFields> {
  if (source() === "postgres") {
    const db = await serverClient();
    if (!db) throw new Error("No database is connected here.");
    return postgres.optionsFor(db);
  }
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Notion is not connected here.");
  return notion.optionsFor(token);
}
