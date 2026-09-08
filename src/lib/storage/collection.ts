/**
 * Where the collection is kept.
 *
 * Three verbs: list the rows, write one, say what the options are. Above
 * this nothing knows how they were answered — lib/core/collection/cards.ts takes rows
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
 * `exists (... is_public)` branch is for. See lib/core/collection/collection.ts's
 * getCards() for where that choice is made and why it happens outside the
 * unstable_cache boundary rather than inside it.
 */

import type { FolderRule, PokedexSetting } from "@/lib/core/collection/folders";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CardDraft,
  CardFields,
  CardPatch,
  CollectionRow,
} from "../core/collection/collection-row";
import type { CopyChanges } from "../core/collection/collection-row";
import type { ValueSnapshot } from "../core/collection/value-snapshot";
import { StoreNotConfigured } from "./errors";
import * as postgres from "./postgres";
import type { SplitResult } from "./postgres";
import { readClient, serverClient, userClient } from "./supabase";

/**
 * The right Postgres client for this caller: their own, or nobody's.
 *
 * Exported because the CSV import needs one connection for three things — read
 * what the collection holds, write the rows, write the import's own record —
 * and building it once beside them is the only way those three agree about who
 * is asking.
 */
export async function clientFor(token?: string): Promise<SupabaseClient | null> {
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
export async function listRows(
  userId?: string,
  db?: SupabaseClient | null,
): Promise<CollectionRow[]> {
  const client = db ?? readClient();
  // A deployment either has a database or it does not, and this is what
  // keeps CI building with no secrets at all.
  if (!client) return [];
  return postgres.listRows(client, userId);
}

/**
 * One person's value readings, or none where this deployment has no store.
 *
 * `db` is required here, unlike listRows above, and that is the whole of the
 * difference between the two tables. listRows may fall back to the anonymous
 * readClient() because cards_read has an `is_public` branch for it to land in.
 * collection_value_snapshots has no such branch on purpose — a value series is
 * nothing but money and no public page wants it — so an anonymous client would
 * be refused every row and answer with an empty history rather than an error.
 * Offering that fallback would just be a tidy-looking way to get the wrong
 * answer, so the caller has to have resolved a client that names them.
 */
export async function listSnapshots(
  userId: string,
  db: SupabaseClient | null,
): Promise<ValueSnapshot[]> {
  if (!db) return [];
  return postgres.listValueSnapshots(db, userId);
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
  if (!db) throw new StoreNotConfigured();
  return postgres.createRow(db, draft);
}

/** Changes one card's owner-facing fields; null when no row of the caller's matched. */
export async function updateRow(
  userId: string,
  id: string,
  patch: CardPatch,
  token?: string,
): Promise<CollectionRow | null> {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.updateRow(db, userId, id, patch);
}

/** Removes one card of the caller's and hands back the row it removed; null when none matched. */
export async function deleteRow(
  userId: string,
  id: string,
  token?: string,
): Promise<CollectionRow | null> {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.deleteRow(db, userId, id);
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
export type { Folder, FolderPatch } from "./postgres";

export async function getFolder(userId: string, id: string, token?: string) {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.getFolder(db, userId, id);
}

export async function createFolder(
  userId: string,
  name: string,
  rule: FolderRule | null,
  pokedex: PokedexSetting | null,
  isPublic: boolean,
  token?: string,
) {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.createFolder(db, userId, name, rule, pokedex, isPublic);
}

export async function updateFolder(
  userId: string,
  id: string,
  patch: postgres.FolderPatch,
  token?: string,
) {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.updateFolder(db, userId, id, patch);
}

export async function deleteFolder(userId: string, id: string, token?: string) {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.deleteFolder(db, userId, id);
}

export async function optionsFor(token?: string): Promise<CardFields> {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
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

/** One more copy of the caller's row, as a row of its own. Null where the row is not theirs. */
export async function copyRow(
  userId: string,
  id: string,
  count: number,
  changes: CopyChanges,
  token?: string,
): Promise<CollectionRow | null> {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.copyRow(db, userId, id, count, changes);
}

/** Some of a row's copies as a row of their own; see postgres.splitRow. */
export async function splitRow(
  userId: string,
  id: string,
  count: number,
  changes: CopyChanges,
  token?: string,
): Promise<SplitResult> {
  const db = await clientFor(token);
  if (!db) throw new StoreNotConfigured();
  return postgres.splitRow(db, userId, id, count, changes);
}
