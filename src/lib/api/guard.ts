import { createRateLimiter } from "./rate-limit";
import { apiError, refuse, REFUSALS, retryAfter } from "./respond";
import { SESSION_COOKIE } from "./session-cookie";
import { StoreNotConfigured } from "../storage/errors";
import { configured } from "../storage/supabase";
import { requestViewer, type Viewer } from "./viewer";

/**
 * Who may read and write, and from where.
 *
 * This file used to argue that reading was open, on the grounds that the
 * collection was already public on the web and a token on every read would be a
 * lock beside an open door. That was true and is not any more. There is a
 * public page now, at /user/<name>, and the whole point of it is that it shows
 * the cards without showing what they are worth. An open /v1/collection would
 * hand back every price to anyone who asked, which turns that page into a
 * curtain rather than a wall. So the door is shut and the endpoints are behind
 * the key; the public page does not go through them at all.
 *
 * Every caller is an account now. CARDS_TOKEN, the one shared passcode that
 * predated accounts, was retired on 2026-09-02: the iOS app signs in with an
 * account, the web app forwards its session as a bearer token, and nothing of
 * ours sent the header any more. A bearer token for the apps, the session
 * cookie for a browser on this origin.
 */

/**
 * Two limiters, because two kinds of caller share an address.
 *
 * A request that carries no account credential — no bearer token, no session
 * cookie — has nothing to say and is only ever a probe, and ten a minute is
 * far above opening a pack and far below guessing anything. A request
 * that carries one is a client we wrote, and the web app's servers make those
 * for every visitor from a handful of shared addresses; holding them to ten
 * would take the site down on its second visitor. A wrong token is refused
 * cheaply after a local signature check, so the generous ceiling only bounds
 * what one address can make this deployment do in a minute.
 */
const guessing = createRateLimiter(60_000, 10);
const withCredential = createRateLimiter(60_000, 600);

const carriesCredential = (req: Request): boolean =>
  /^bearer\s+\S+/i.test(req.headers.get("authorization") ?? "") ||
  (req.headers.get("cookie") ?? "").includes(`${SESSION_COOKIE}=`);

/**
 * What a route sends instead of the viewer. `headers` is the rare extra a
 * refusal carries beyond the sentence — today only `Retry-After` on a 429 —
 * and a route spreads it over readHeaders() when it answers.
 */
export type Refusal = { status: number; error: string; headers?: Record<string, string> };

/**
 * The one message every route reaches for when serverClient()/configured()
 * says there is nowhere to write. Shared so the six places that send it can't
 * drift into six slightly different sentences.
 */
export const NO_DATABASE_CONFIGURED = REFUSALS.noDatabase.error;

/**
 * Which origins may post here, from ALLOWED_ORIGINS, comma separated.
 *
 * This started life on the portfolio as a same-origin check, which is right for
 * a form on its own site and wrong the moment there is a second client: the
 * whole point of this project is that the app and the tool are somewhere else.
 * An allowlist keeps what that check was actually for. A cross-site POST with
 * `Content-Type: text/plain` is a "simple request", so it is sent without a
 * preflight and the write would happen before the browser blocked the reply;
 * requiring a JSON content type forces the preflight, and this decides who
 * survives it.
 *
 * A request with no Origin at all is not a browser, and is allowed: that is the
 * iOS app and it is curl. Neither can be tricked into posting on someone
 * else's behalf, which is the whole risk this defends against.
 */
const allowed = () =>
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  // Its own pages first, always. ALLOWED_ORIGINS is a list of *other* sites
  // that may talk to this one; a request from the app to itself is not one of
  // those and should not have to be written down to work. It had to be, until
  // now, which is why a development port that was not on the list refused the
  // add form for reasons that looked like a bad key.
  return sameOrigin(req) || allowed().includes(origin);
}

/**
 * Whether this request came from the page it is asking about.
 *
 * The allowlist above answers "may this other site talk to us", which is the
 * right question for a write from the iOS app or from a tool on another domain.
 * It is the wrong question for signing in: that form is only ever served by
 * this app, on whatever host this app happens to be on. Putting it behind
 * ALLOWED_ORIGINS meant every deployment and every development port had to be
 * written down, and a workspace here gets a different port each time — so the
 * login refused the owner on a technicality that had nothing to do with the key.
 *
 * Comparing Origin against the request's own host is the check that was
 * actually wanted, and it is the standard defence against a form on another
 * site posting here on someone's behalf. A request with no Origin is not a
 * browser and cannot be a cross-site form post; it is curl, and it is fine.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  // The forwarded host first: behind a proxy, req.url has been rewritten to the
  // internal address and would never match what the browser sent.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * The cookie a signed-in browser carries. Set by POST /api/v1/session.
 *
 * Imported rather than declared here, and passed straight back out: proxy.ts
 * needs the name and should not be dragging this file's node:crypto import to
 * the network boundary for it, so the string lives in session-cookie.ts — see
 * the comment there for why that is still true. Imported *and* exported, not
 * re-exported in one line — `export { x } from` forwards the name without
 */

/**
 * Whether a key is the right one, in constant time.
 *
 * timingSafeEqual throws on a length mismatch, which would be a length oracle
 * if it were caught and turned into an answer. The lengths are compared first
 * and folded in, so every wrong key costs the same.
 */

/**
 * Who is asking. Returns the viewer, or the refusal to send instead.
 *
 * For the /v1 data routes only. The session-management routes (login,
 * signup, password, confirmation) call sameOrigin() and currentViewer()
 * directly instead of this — they are only ever posted to by this app's own
 * pages, so they don't need the ALLOWED_ORIGINS cross-site allowlist or the
 * read-cache headers this pairs with (readHeaders()) that the data routes do.
 * Reach for authorise() when a route serves the iOS app or another client;
 * reach for sameOrigin() + currentViewer() when a route only ever runs from
 * this app's own forms.
 *
 * Every function this replaced answered "is this the key". This one answers
 * "who is this", and that is the whole of what accounts change at the door: a
 * boolean cannot name a person, and every caller downstream needs the name.
 *
 * The order is unchanged and still deliberate: the checks that need no secret
 * come first, so a flood of cross-site requests is turned away before it can
 * touch the limiter's map, let alone a token verification.
 *
 * Async now, which is the one thing that ripples — a signature is checked and
 * sometimes a profile is read, and neither is a comparison against an
 * environment variable any more.
 */
export async function authorise(req: Request): Promise<Refusal | Viewer> {
  if (!originAllowed(req)) return { status: 403, error: "Forbidden" };

  // x-real-ip first: the platform sets it from the actual connection. The
  // leftmost X-Forwarded-For entry is client-supplied whenever a proxy appends
  // rather than replaces, which would let a flood rotate its own key.
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const wait = (carriesCredential(req) ? withCredential : guessing)(ip);
  if (wait) return { ...REFUSALS.tooMany, headers: retryAfter(wait) };

  // Told apart from a wrong credential on purpose, and kept in the same place
  // in the order. A deployment with no database is not somebody getting it
  // wrong, and the client can say so rather than sending its user looking for a
  // password that would not work anyway.
  if (!configured()) {
    console.error("No database is configured: every request will be refused");
    return { status: 503, error: NO_DATABASE_CONFIGURED };
  }

  const viewer = await requestViewer(req);
  // The same sentence the cookie-only routes send through refuse("signIn"):
  // two wordings for one condition had the clients showing either.
  if (!viewer) return { ...REFUSALS.signIn };
  return viewer;
}

/** Whether authorise() said no. Narrow, so the caller keeps the viewer typed. */
export const refused = (r: Refusal | Viewer): r is Refusal => "status" in r;

/**
 * The same, plus the content type. A cross-site POST is only a "simple request"
 * while its content type is one of three, so insisting on JSON is what forces
 * the preflight that the origin check above then decides.
 */
export async function authoriseWrite(req: Request): Promise<Refusal | Viewer> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return { status: 415, error: "Invalid request" };
  }
  return authorise(req);
}

/**
 * The headers a read carries.
 *
 * `Access-Control-Allow-Origin: *` is gone: a wildcard and a credentialed
 * request are mutually exclusive, so a browser would refuse to send the session
 * cookie to an endpoint that answered with one. Reads are answered to the
 * origins on the allowlist, and `Vary: Origin` keeps a cache from handing one
 * origin's answer to another.
 *
 * `private, no-store` for the same reason the wildcard went: these answers are
 * now behind a key, and a shared cache must not keep one and serve it to the
 * next person who asks without one.
 */
/**
 * Turns a failed store call into the response every write route was building
 * by hand. The store's own words go to the log and nowhere else: they carry
 * PostgREST's table, column and constraint names, and this used to put them
 * on the wire for anyone with a token. The client gets `operation` as a
 * sentence — "Updating a card failed." — and a status to branch on.
 *
 * A deployment with no store at all is a 503 rather than a 502: nothing
 * refused, there is simply nothing to ask. Told apart by type, because the
 * regex this used to match never agreed with the sentence the store threw.
 */
export function storeErrorResponse(err: unknown, req: Request, operation: string) {
  console.error(`${operation}:`, err instanceof Error ? err.message : err);
  if (err instanceof StoreNotConfigured) return refuse("noDatabase", { headers: readHeaders(req) });
  return apiError(502, `${operation}.`, undefined, { headers: readHeaders(req) });
}

export function readHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    ...(origin && allowed().includes(origin)
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" }
      : {}),
    Vary: "Origin",
    "Cache-Control": "private, no-store",
  };
}
