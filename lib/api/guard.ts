import { timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "./rate-limit";

/**
 * Who may write, and from where.
 *
 * Reading is open. This collection is already public on the web, and a token on
 * every read would be a lock on a door that is standing open next to it: it
 * buys nothing and it costs every client an auth path. Writing is a different
 * question and it is the only one this file answers.
 *
 * The web tool, the iOS app and the portfolio all write with the same key.
 * CARDS_TOKEN is a shared passcode, not an account system: one person edits
 * this collection, and a login with a password reset behind it would be
 * furniture. If there is ever a second person, this is the one file that has to
 * change.
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
  return allowed().includes(origin);
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

  const expected = process.env.CARDS_TOKEN;
  // Told apart from a wrong key on purpose. A deployment without the variable
  // is not somebody getting it wrong, and the client can say so rather than
  // sending its user looking for a password that would not work anyway.
  if (!expected) {
    console.error("CARDS_TOKEN is not set: every write will be refused");
    return { status: 503, error: "Writing is not configured here." };
  }

  const given = req.headers.get("x-cards-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would be a length oracle
  // if it were caught and turned into an answer. The lengths are compared first
  // and folded in, so every wrong key costs the same.
  if (!(a.length === b.length && timingSafeEqual(a, b))) {
    return { status: 401, error: "That key is not right." };
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
 * The headers a read carries. Open, because the answers are public, and stated
 * rather than left to a default so a client on another origin is a supported
 * case rather than an accident.
 */
export const readHeaders = {
  "Access-Control-Allow-Origin": "*",
  Vary: "Origin",
};
