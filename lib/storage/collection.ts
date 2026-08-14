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
 *
 * ── Which Postgres client, and why every verb below takes one ─────────────
 *
 * Every Postgres verb here used to build its own client — readClient() for
 * reads, serverClient() for writes — regardless of who was actually asking.
 * That was silently wrong for anyone who arrived by bearer token rather than
 * cookie: serverClient() resolves a session from cookies() and finds none, so
 * auth.uid() is null for the rest of the request, and row level security
 * (correctly) refuses either the read or the write. It was not a caching or a
 * plumbing bug, it was every Postgres-backed account being unable to see or
 * add to its own collection through the API — found by seeding a row for a
 * test account directly and confirming GET /v1/collection still came back
 * empty, and by POSTing a card with a real access token and reading back the
 * RLS refusal in the response.
 *
 * The fix is not a different policy — cards_read/cards_insert are already the
 * right rule, "you may act on your own rows" — it is asking Postgres with the
 * connection that names the caller. `db` below is that connection, resolved
 * by whoever knows how the caller arrived: an API route holding a bearer
 * token builds userClient(token); a page render holding cookies builds
 * serverClient(); a stranger reading a public profile passes neither and
 * falls back to the anonymous readClient(), which is what cards_read's
 * `exists (... is_public)` branch is for. See lib/core/collection.ts's
 * getCards() for where that choice is made and why it happens outside the
 * unstable_cache boundary rather than inside it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardDraft, CardFields, CardPatch, CollectionRow } from "../core/collection-row";
import * as notion from "./notion";
import * as postgres from "./postgres";
import { readClient, serverClient, userClient } from "./supabase";

export type Source = "notion" | "postgres";

/** The right Postgres client for this caller: their own, or nobody's. */
async function clientFor(token?: string): Promise<SupabaseClient | null> {
  return token ? userClient(token) : serverClient();
}

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
 * `db`, when given, is the caller's own Postgres connection — built outside
 * unstable_cache by getCards(), see the note above. Left out, this falls back
 * to the anonymous readClient(), which combined with an explicit `userId`
 * filter is what the public page wants: cards_read's `is_public` branch is
 * the only thing standing between an anonymous client and a private
 * collection, filter or no filter. It is ignored on Notion, where there is
 * one collection and no such question.
 */
export async function listRows(userId?: string, db?: SupabaseClient | null): Promise<CollectionRow[]> {
  if (source() === "postgres") {
    const client = db ?? readClient();
    // Same fail-soft as a missing Notion token: a deployment either has a
    // database or it does not, and this is what keeps CI building with no
    // secrets at all.
    if (!client) return [];
    return postgres.listRows(client, userId);
  }
  const token = process.env.NOTION_TOKEN;
  // Not a failure, and the one empty worth remembering: a deployment either has
  // the token or it does not, and it will not acquire one mid-process.
  if (!token) return [];
  return notion.listRows(token);
}

/**
 * Writes one card and returns the store's id for it.
 *
 * `token`, when given, is the caller's own access token — an API route
 * holding a bearer credential (curl, iOS) rather than a browser session. Left
 * out, this falls back to the cookie-bound serverClient(), which is what the
 * web app's own add-card form carries. Without either, the write has no
 * caller to be authorised as and cards_insert refuses it, correctly.
 */
export async function createRow(draft: CardDraft, token?: string): Promise<string> {
  if (source() === "postgres") {
    const db = await clientFor(token);
    if (!db) throw new Error("No database is connected here.");
    return postgres.createRow(db, draft);
  }
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) throw new Error("Notion is not connected here.");
  return notion.createRow(draft, notionToken);
}

/** Changes one card's owner-facing fields. Postgres only — see updateRow's own doc. */
export async function updateRow(id: string, patch: CardPatch, token?: string): Promise<CollectionRow> {
  if (source() !== "postgres") {
    throw new Error("Editing a card is not supported on this storage backend.");
  }
  const db = await clientFor(token);
  if (!db) throw new Error("No database is connected here.");
  return postgres.updateRow(db, id, patch);
}

/** Removes one card. Postgres only, for the reason updateRow() gives. */
export async function deleteRow(id: string, token?: string): Promise<void> {
  if (source() !== "postgres") {
    throw new Error("Deleting a card is not supported on this storage backend.");
  }
  const db = await clientFor(token);
  if (!db) throw new Error("No database is connected here.");
  return postgres.deleteRow(db, id);
}

/**
 * What the form should offer in its four selects.
 *
 * Same client rule as createRow(): a bearer token if the caller has one,
 * cookies otherwise. collection_options() is `security invoker` and reads
 * `auth.uid()` itself, so an unauthenticated client answers with four empty
 * lists rather than an error — worth knowing if a filter picker looks
 * emptier than the collection actually is.
 */
export async function optionsFor(token?: string): Promise<CardFields> {
  if (source() === "postgres") {
    const db = await clientFor(token);
    if (!db) throw new Error("No database is connected here.");
    return postgres.optionsFor(db);
  }
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) throw new Error("Notion is not connected here.");
  return notion.optionsFor(notionToken);
}

/**
 * Who /user/<name> belongs to, when the store can answer that.
 *
 * Null on Notion, which has one collection and no notion of whose: that
 * deployment falls back to PUBLIC_USERNAME, which is what it always did.
 */
export async function publicProfile(username: string) {
  if (source() !== "postgres") return null;
  const db = await serverClient();
  if (!db) return null;
  return postgres.profileByUsername(db, username);
}
