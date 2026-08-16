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

export type Viewer = {
  userId: string;
  email: string;
  /** The name in /user/<name>. Always present: a trigger makes one. */
  username: string;
  /** What this person chose to be called, or null if they never set one.
   *  Anything that greets somebody should prefer this over `username` and
   *  fall back to it — see displayNameOf() below. */
  displayName: string | null;
  /** The avatars bucket's public URL for this account, or null until one is
   *  uploaded. See app/api/v1/profile/avatar/route.ts. */
  avatarUrl: string | null;
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
 * A verified token into a viewer, or null.
 *
 * The profile lookup is a second query and it is worth it: everything that
 * renders a person needs their username, and a Viewer that carried only an id
 * would push that query into every caller instead. It reads through the same
 * client, so a profile row that RLS will not show is a viewer we do not claim
 * to know.
 */
async function viewerFrom(db: SupabaseClient, jwt?: string): Promise<Viewer | null> {
  const { data, error } = await db.auth.getClaims(jwt);
  if (error || !data?.claims?.sub) return null;

  const { sub, email } = data.claims as { sub: string; email?: string };

  const { data: profile } = await db
    .from("profiles")
    // display_name rides along on the query that was already being made: a
    // screen that greets somebody by name should not cost a second round trip
    // to find out what their name is.
    .select("username,display_name,avatar_url")
    .eq("id", sub)
    .maybeSingle();

  const p = profile as {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  return {
    userId: sub,
    email: email ?? "",
    // A signed-in account without a profile should not exist — the trigger in
    // the accounts migration makes one in the same transaction as the user — so
    // this fallback is not a supported state, it is a way of not crashing in
    // one. The empty string never resolves as a username, which is the correct
    // outcome for an account that has no name yet.
    username: p?.username ?? "",
    displayName: p?.display_name ?? null,
    avatarUrl: p?.avatar_url ?? null,
  };
}

/**
 * What to call this person on screen.
 *
 * One function rather than `viewer.displayName || viewer.username` written out
 * at each call site, because the fallback chain is the part that is easy to get
 * subtly different: a display name of "   " is not a name, and an account whose
 * profile row is missing (see above) has no username either.
 *
 * Not OWNER_NAME. The landing page used to greet every signed-in visitor with
 * the deployment's owner name — correct exactly once, for one person, and
 * wrong for everybody else who signs up.
 */
export function displayNameOf(viewer: Pick<Viewer, "displayName" | "username" | "email">): string {
  const chosen = viewer.displayName?.trim();
  if (chosen) return chosen;
  if (viewer.username) return viewer.username;
  // Last resort, and only reachable in the unsupported profile-less state:
  // the part of the address before the @, which is at least theirs.
  return viewer.email.split("@")[0] || "your account";
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
 * Bearer first, then the cookie, which is the same precedence keyFrom() used
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
