/**
 * Clients, and which one is allowed to be where.
 *
 * Three of them, and the distinction between them is the whole security story
 * of this app once there is more than one person in the database.
 *
 * The first two carry a *caller*. Every query they make arrives at Postgres as
 * somebody, and the policies in the accounts migration decide what that
 * somebody can see. A query that forgets its WHERE clause comes back empty
 * rather than coming back with the wrong person's binder, which is the entire
 * reason row level security was worth the setup.
 *
 * The third carries none, and bypasses every policy there is. It exists for two
 * jobs that genuinely have no caller — the one-time import, and deleting an
 * account — and it must never be reachable from a request. The key that backs it
 * is not NEXT_PUBLIC_ for that reason, so importing this module into a client
 * component gets you `null` rather than a skeleton key in the browser bundle.
 *
 * ── On returning null ──────────────────────────────────────────────────────
 * Every factory answers null when the deployment has no database configured,
 * and that is deliberate rather than lazy. CI builds with no secrets at all and
 * has to keep doing so; the existing convention is that a missing credential
 * degrades to an empty collection and a page that says so. This keeps that
 * convention rather than introducing the first thing in the project that throws
 * at import time.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** Whether this deployment has a database at all. */
export function configured(): boolean {
  return Boolean(url() && anon());
}

/**
 * The caller's own client, from a token they sent.
 *
 * For requests that arrive with `Authorization: Bearer <jwt>` rather than a
 * cookie — curl, and the iOS and Android apps when they exist. The token is put
 * in the header of every onward request, so PostgREST resolves auth.uid() from
 * it and the policies do the rest.
 *
 * No session persistence and no auto-refresh: this client lives for one request
 * and there is nowhere on a server for it to persist a session *to*. Left on,
 * the SDK would try, and in a serverless process that is at best wasted work and
 * at worst two requests sharing a token store.
 */
export function userClient(accessToken: string): SupabaseClient | null {
  const [u, a] = [url(), anon()];
  if (!u || !a) return null;
  return createClient(u, a, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Nobody's client, for the rows anybody may read.
 *
 * Anonymous on purpose. It sends no session, so auth.uid() is null over there
 * and cards_read leaves exactly the collections whose profile says is_public —
 * which is what the public page wants and all it wants.
 *
 * It exists because the cookie-bound client below cannot be used from inside a
 * cross-request cache. Next refuses `cookies()` in that scope and is right to:
 * a cache entry outlives the request that filled it, so a client built from one
 * person's cookies would be answering the next person's question with the first
 * person's session. That is the same disclosure bug the module-level slot in
 * lib/core/collection.ts was killed for, one layer down. A read that is cached
 * across requests has to be a read that belongs to nobody, and this is it.
 */
export function readClient(): SupabaseClient | null {
  const [u, a] = [url(), anon()];
  if (!u || !a) return null;
  return createClient(u, a, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The cookie-bound client, for rendering.
 *
 * Reads the session out of the request's cookies and, where the framework lets
 * it, writes a refreshed one back. `setAll` is wrapped in a try/catch because
 * Next refuses cookie writes from a Server Component — there is no response to
 * attach them to yet — and that refusal is expected rather than exceptional.
 * The proxy is what refreshes the session in that case, which is exactly the
 * division of labour @supabase/ssr documents.
 *
 * A new client per call, never a shared one. Sharing a client across requests
 * is sharing a session across people, which is the same bug this whole phase
 * exists to remove from the caching layer.
 */
export async function serverClient(): Promise<SupabaseClient | null> {
  const [u, a] = [url(), anon()];
  if (!u || !a) return null;

  const jar = await cookies();
  return createServerClient(u, a, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) jar.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session instead; see proxy.ts.
        }
      },
    },
  });
}

/**
 * The service role, which is not a caller and answers to nobody.
 *
 * Two callers only: scripts/import-notion.mjs and, when it exists, account
 * deletion. Everything else in this app must go through one of the two above,
 * because everything else in this app is acting on behalf of somebody and this
 * client cannot represent that.
 *
 * It reads a key that is deliberately not NEXT_PUBLIC_, so this returns null in
 * any context where the browser bundle could have reached it.
 */
export function adminClient(): SupabaseClient | null {
  const u = url();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!u || !key) return null;
  return createClient(u, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
