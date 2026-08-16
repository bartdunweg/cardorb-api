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
  /**
   * The name this person gave for themselves, or null if they have not.
   *
   * Never read on its own: pass the viewer to ownerLabel() (lib/core/owner.ts),
   * which falls back to the username. Nullable because it genuinely is — signup
   * used to seed it with the generated username, which made "no name given"
   * indistinguishable from a name, and stopped doing so.
   */
  displayName: string | null;
  /** The avatars bucket's public URL for this account, or null until one is
   *  uploaded. See app/api/v1/profile/avatar/route.ts. */
  avatarUrl: string | null;
  /** When this account finished (or skipped past) the welcome flow, null while
   *  it has not. Read here rather than in a query of its own because the (app)
   *  layout has to check it on every render, and it already pays for this
   *  lookup. See app/welcome/page.tsx. */
  onboardedAt: string | null;
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
    .select("username,display_name,avatar_url,onboarded_at")
    .eq("id", sub)
    .maybeSingle();

  const p = profile as {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
    onboarded_at?: string | null;
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
    // A profile row this lookup could not read is not a reason to send anybody
    // through the welcome flow, but there is no row to write the answer to
    // either — the fallback above already says this is a state that should not
    // happen, and null here means the flow runs rather than being skipped by
    // an error. Better a wizard nobody needed than a setup silently missed.
    onboardedAt: p?.onboarded_at ?? null,
  };
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
