import { timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./rate-limit";
import { SESSION_COOKIE } from "./session-cookie";

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
 * Imported rather than declared here, and passed straight back out: the
 * middleware needs the name and cannot afford this file's node:crypto import,
 * so the string lives in session-cookie.ts. Imported *and* exported, not
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
 * middleware, and there is one comparison in the app rather than two that have
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
 * Whether this is the owner's address.
 *
 * Not a secret, and not treated as one: an email is a name, and the thing that
 * proves you are its owner is the password beside it. So this is a plain
 * comparison, case-insensitive and trimmed, because nobody types their own
 * address the same way twice and a login that refuses "Bart@" is a login that
 * looks broken.
 *
 * It exists at all so the email field is a real check rather than decoration.
 * A form that asks for two things and only reads one is worse than a form that
 * asks for one: it tells you the account is yours when the door is the
 * password alone.
 */
export function emailIsRight(given: string): boolean {
  const expected = process.env.OWNER_EMAIL;
  if (!expected) return false;
  return given.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function keyIsRight(given: string): boolean {
  const expected = process.env.CARDS_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Who is asking: origin, rate, key. Returns the refusal, or null to carry on.
 *
 * Separate from the content-type check below because /v1/fields wants exactly
 * this and is a GET: it is behind the key, since it is the cheapest thing a
 * client can call to find out whether the key it holds still works.
 *
 * The order is deliberate: the checks that need no secret come first, so a
 * flood of cross-site requests is turned away before it can touch the limiter's
 * map or the key comparison.
 */
export function refuseUnauthorised(req: Request): Refusal | null {
  if (!originAllowed(req)) return { status: 403, error: "Forbidden" };

  // x-real-ip first: the platform sets it from the actual connection. The
  // leftmost X-Forwarded-For entry is client-supplied whenever a proxy appends
  // rather than replaces, which would let a flood rotate its own key.
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (rateLimited(ip)) return { status: 429, error: "Too many requests" };

  // Told apart from a wrong key on purpose. A deployment without the variable
  // is not somebody getting it wrong, and the client can say so rather than
  // sending its user looking for a password that would not work anyway.
  if (!process.env.CARDS_TOKEN) {
    console.error("CARDS_TOKEN is not set: every request will be refused");
    return { status: 503, error: "This deployment has no key configured." };
  }

  if (!keyIsRight(keyFrom(req))) {
    return { status: 401, error: "That password is not right." };
  }

  return null;
}

/**
 * The same, plus the content type. A cross-site POST is only a "simple request"
 * while its content type is one of three, so insisting on JSON is what forces
 * the preflight that the origin check above then decides.
 */
export function refuseWrite(req: Request): Refusal | null {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return { status: 415, error: "Invalid request" };
  }
  return refuseUnauthorised(req);
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
