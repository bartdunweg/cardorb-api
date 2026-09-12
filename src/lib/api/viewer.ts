/**
 * Who is asking, resolved once and asked for everywhere.
 *
 * This is the data access layer Next's own security guide describes: one
 * function that answers "who is this", called by every page and every route
 * that needs to know, rather than each of them reading a cookie and drawing its
 * own conclusion. The version of that this app had was a cookie *presence*
 * check in two places, which was honest while a cookie could only ever mean one
 * person. It stops being honest the moment a cookie names somebody.
 *
 * ── Why getClaims() and not getUser() ──────────────────────────────────────
 * getUser() asks the auth server, every time, which is a network round trip in
 * front of every authorised request — tens of milliseconds on a call that
 * should cost microseconds. getClaims() verifies the token's signature locally
 * against the project's published keys where the project uses asymmetric
 * signing, and falls back to exactly what getUser() does where it does not. So
 * the code is correct either way and gets faster when the project is switched
 * over, which is the right way round: the setting is an optimisation rather
 * than a prerequisite.
 *
 * Not getSession(). The SDK's own warning is blunt about it — a session read
 * out of cookies is unverified, and cookies are somebody else's input.
 */

import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverClient, userClient } from "../storage/supabase";
import { timed } from "../core/timing";

export type Viewer = {
  userId: string;
  email: string;
};

/**
 * The bearer token on a request, if it carries one.
 *
 * Exported alongside requestViewer() rather than kept private, for the
 * routes that need the token itself and not just who it names: every
 * Postgres write and read below the accounts migration is subject to row
 * level security, which is enforced against the client's own connection, not
 * against a userId the application hands over. A route that resolved its
 * viewer via this token and then queried through a cookie-bound or anonymous
 * client would be asking Postgres to authorise a caller it never saw — see
 * lib/storage/collection.ts, which threads this same token through to
 * userClient() for exactly that reason.
 */
export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return rest.join(" ").trim() || null;
}

/**
 * The name in /user/<name>, read for the one caller that is about to need it.
 *
 * This used to be part of every viewer: `authorise()` verified the token and then asked
 * Postgres for the person's username, display name, avatar and onboarding date, on every
 * authorised request. Postgres was never the cost (0.1 ms mean by its own statistics); getting
 * to it was, and on 2026-09-12 that read measured a median of 58 ms, a p90 of 8.4 seconds and a
 * worst of 17.6. It was kept for a minute per instance to soften that, which is a cache with a
 * staleness window in front of a query nobody had asked for: nothing here reads the display
 * name, the avatar or the onboarding date (the web app reads its own profile for those), and the
 * name is wanted in two places only, both after a write: `POST /v1/username`, which is about to
 * replace it, and the purge that tells cardorb.com which public page to drop (web-cache.ts).
 * Asked for there, every read of every route stops waiting for it.
 *
 * Through the caller's own client, so a row RLS will not show is a name we do not claim to know;
 * the empty string for a row that is not there, which never resolves as a username, and is the
 * right answer for an account whose trigger has not run.
 */
export async function usernameOf(userId: string, token?: string): Promise<string> {
  const db = token ? userClient(token) : await serverClient();
  if (!db) return "";
  const { data } = await timed("store username", async () =>
    db.from("profiles").select("username").eq("id", userId).maybeSingle(),
  );
  return (data as { username?: string } | null)?.username ?? "";
}

async function viewerFrom(db: SupabaseClient, jwt?: string): Promise<Viewer | null> {
  const { data, error } = await timed("auth getClaims", () => db.auth.getClaims(jwt));
  if (error || !data?.claims?.sub) return null;
  const { sub, email } = data.claims as { sub: string; email?: string };
  return { userId: sub, email: email ?? "" };
}

/**
 * Who is rendering this page.
 *
 * cache() and not a module slot, for the reason the collection cache learned
 * the hard way: a slot per process is a slot the next request inherits, and the
 * next request is somebody else. This is scoped to one request by construction.
 *
 * Null where nobody is signed in, and null where the deployment has no database
 * — the caller cannot tell those apart and should not need to, because both
 * mean the same thing to a page: show the door.
 */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  const db = await serverClient();
  if (!db) return null;
  return viewerFrom(db);
});

/**
 * Who is making this request, for the routes that are not a rendered page.
 *
 * Bearer first, then the cookie, the precedence the passcode path once used
 * and for the same reason: a client that bothered to set a header is being
 * explicit, and a stale cookie should not quietly override it. The iOS and
 * Android apps are the bearer half; the browser is the cookie half.
 *
 * Not wrapped in cache(): a Request is an argument, and two different requests
 * inside one render is exactly the situation a memo must not collapse.
 */
export async function requestViewer(req: Request): Promise<Viewer | null> {
  const token = bearer(req);
  if (token) {
    const db = userClient(token);
    return db ? viewerFrom(db, token) : null;
  }
  return currentViewer();
}
