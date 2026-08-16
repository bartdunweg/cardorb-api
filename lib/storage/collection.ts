/**
 * Where the collection is kept.
 *
 * Three verbs: list the rows, write one, say what the options are. Above
 * this nothing knows how they were answered — lib/core/cards.ts takes rows
 * and matches them against three catalogues regardless of where they came
 * from.
 *
 * Fails soft on the read, like everything else that faces the page: no
 * database connection and there is no collection, which renders an empty
 * state rather than an error. The write does not get that: a read that
 * fails loses nothing and a write that fails quietly loses the card
 * somebody just pulled.
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
import * as postgres from "./postgres";
import { readClient, serverClient, userClient } from "./supabase";

/** The right Postgres client for this caller: their own, or nobody's. */
async function clientFor(token?: string): Promise<SupabaseClient | null> {
  return token ? userClient(token) : serverClient();
}

/**
 * Every row the caller may see, or none where this deployment has no store.
 *
 * `db`, when given, is the caller's own Postgres connection — built outside
 * unstable_cache by getCards(), see the note above. Left out, this falls back
 * to the anonymous readClient(), which combined with an explicit `userId`
 * filter is what the public page wants: cards_read's `is_public` branch is
 * the only thing standing between an anonymous client and a private
 * collection, filter or no filter.
 */
export async function listRows(userId?: string, db?: SupabaseClient | null): Promise<CollectionRow[]> {
  const client = db ?? readClient();
  // A deployment either has a database or it does not, and this is what
  // keeps CI building with no secrets at all.
  if (!client) return [];
  return postgres.listRows(client, userId);
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
  const db = await clientFor(token);
  if (!db) throw new Error("No database is connected here.");
  return postgres.createRow(db, draft);
}

/** Changes one card's owner-facing fields. */
export async function updateRow(id: string, patch: CardPatch, token?: string): Promise<CollectionRow> {
  const db = await clientFor(token);
  if (!db) throw new Error("No database is connected here.");
  return postgres.updateRow(db, id, patch);
}

/** Removes one card. */
export async function deleteRow(id: string, token?: string): Promise<void> {
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
  const db = await clientFor(token);
  if (!db) throw new Error("No database is connected here.");
  return postgres.optionsFor(db);
}

/** Who /user/<name> belongs to. */
export async function publicProfile(username: string) {
  const db = await serverClient();
  if (!db) return null;
  return postgres.profileByUsername(db, username);
}

/**
 * Which /user/<name> pages there are to list.
 *
 * Fails soft to nothing, unlike its neighbours, because the one caller is the
 * sitemap: a store that is unreachable for a minute should cost a crawler the
 * profile entries for that minute, not a 500 on /sitemap.xml.
 */
export async function publicUsernames(): Promise<string[]> {
  const db = await serverClient();
  if (!db) return [];
  try {
    return await postgres.publicUsernames(db);
  } catch (err) {
    console.error("Listing public profiles for the sitemap failed:", err);
    return [];
  }
}
