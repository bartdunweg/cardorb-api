import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createRateLimiter } from "./rate-limit";
import { SESSION_COOKIE } from "./session-cookie";
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
 * CARDS_TOKEN is still a shared passcode rather than an account system: one
 * person edits this collection. What changed is where a browser keeps it. It
 * used to sit in localStorage and travel as an x-cards-key header, which the
 * server cannot see until JavaScript runs — so a page could not know who was
 * looking while it was being rendered. It is a cookie now. Both are accepted:
 * the header for curl and for the iOS app, the cookie for the browser.
 */

/** Ten a minute per address: far above opening a pack, far below guessing a key. */
const rateLimited = createRateLimiter(60_000, 10);

export type Refusal = { status: number; error: string };

/**
 * The one message every route reaches for when serverClient()/configured()
 * says there is nowhere to write. Shared so the six places that send it can't
 * drift into six slightly different sentences.
 */
export const NO_DATABASE_CONFIGURED = "This deployment has no database configured.";

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
 * binding it locally, and keyFrom below reads it.
 */
export { SESSION_COOKIE };

/**
 * The key this request is offering, from either place it is allowed to be.
 *
 * The header wins when both are present, because a client that bothered to set
 * one is being explicit and a stale cookie should not quietly override it.
 *
 * Parsed by hand rather than through next/headers so this stays a plain
 * `Request` function: the same code then answers for a route handler and for
 * the proxy, and there is one comparison in the app rather than two that have
 * to be kept agreeing with each other.
 */
export function keyFrom(req: Request): string {
  const header = req.headers.get("x-cards-key");
  if (header) return header;
  const jar = req.headers.get("cookie");
  if (!jar) return "";
  for (const part of jar.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

/**
 * Whether a key is the right one, in constant time.
 *
 * timingSafeEqual throws on a length mismatch, which would be a length oracle
 * if it were caught and turned into an answer. The lengths are compared first
 * and folded in, so every wrong key costs the same.
 */
/**
 * Whether a key is the one shared passcode, in constant time.
 *
 * On its way out. This is the compatibility path: curl, the snapshot script and
 * anything else that learned CARDS_TOKEN keeps working while accounts arrive
 * beside it, resolving to whoever OWNER_USER_ID names. It logs every time it is
 * used, so the question "does anything still depend on this" has an answer in
 * the logs rather than in somebody's memory.
 *
 * timingSafeEqual throws on a length mismatch, which would be a length oracle
 * if it were caught and turned into an answer. The lengths are compared first
 * and folded in, so every wrong key costs the same.
 */
export function keyIsRight(given: string): boolean {
  const expected = process.env.CARDS_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
  if (rateLimited(ip)) return { status: 429, error: "Too many requests" };

  // Told apart from a wrong credential on purpose, and kept in the same place
  // in the order. A deployment with no database is not somebody getting it
  // wrong, and the client can say so rather than sending its user looking for a
  // password that would not work anyway.
  if (!configured()) {
    console.error("No database is configured: every request will be refused");
    return { status: 503, error: NO_DATABASE_CONFIGURED };
  }

  // The compatibility path, first because it is cheapest and because a request
  // carrying this header is not carrying a session. It is deliberately narrow:
  // the passcode alone is not an identity, so it only works where the
  // deployment has said which account it stands for.
  const legacy = req.headers.get("x-cards-key");
  if (legacy && keyIsRight(legacy)) {
    const owner = process.env.OWNER_USER_ID?.trim();
    if (!owner) {
      console.error("CARDS_TOKEN was accepted but OWNER_USER_ID is not set: nobody to be");
      return { status: 503, error: "This deployment has no account configured." };
    }
    console.warn("[deprecated] CARDS_TOKEN was used; move this client to an account token");
    return { userId: owner, email: process.env.OWNER_EMAIL ?? "", username: "" };
  }

  const viewer = await requestViewer(req);
  if (!viewer) return { status: 401, error: "Sign in to see this." };
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
 * Turns a failed store call into the response two read routes were building by
 * hand, identically. The store's own words, because the only person who can
 * read this is the one who can act on it, and "something went wrong" would
 * send them to the logs for a message that is already here.
 *
 * A deployment with no store at all is a 503 rather than a 502: nothing
 * refused, there is simply nothing to ask. Told apart on the message rather
 * than on a type, because there is one shape of failure the store raises
 * before it has tried anything.
 */
export function storeErrorResponse(err: unknown, req: Request, logPrefix: string) {
  const message = err instanceof Error ? err.message : "The collection did not answer.";
  console.error(`${logPrefix}:`, message);
  const unconfigured = /not connected|not wired up/.test(message);
  return NextResponse.json(
    { error: message },
    { status: unconfigured ? 503 : 502, headers: readHeaders(req) },
  );
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
