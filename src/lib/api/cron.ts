import { timingSafeEqual } from "node:crypto";
import { apiError } from "./respond";

/**
 * The one door the cron routes share.
 *
 * Five routes under `/api/v1/cron/` are reachable by anyone who can reach the deployment, and
 * `CRON_SECRET` is the only thing between them and a stranger: every one of them then builds
 * `adminClient()`, which is past every policy there is. Each used to compare the bearer with
 * `!==`, which returns on the first byte that differs and so tells the caller, in the time it
 * took to answer, how much of a guess was right. A guess at a secret is cheap to repeat, so the
 * timing is worth something to whoever is guessing and worth nothing to us.
 *
 * `timingSafeEqual` refuses two buffers of different lengths outright (it throws), so the length
 * is compared first and the answer is the same either way. That check leaks the secret's length,
 * which is not a secret: `CRON_SECRET` is generated, not chosen, and knowing it is 64 characters
 * does not shorten the search enough to matter. The same pattern guards the web app's
 * `/api/revalidate`. R-SEC-004.
 *
 * Fails closed with no secret set, which is the behaviour each route already had: a deployment
 * that has not been configured does not get an unauthenticated write endpoint as a consolation
 * prize. 503 there and 401 for a wrong bearer, both unchanged, because Vercel's cron reads the
 * status and a monitor branches on it.
 */

/**
 * Whether `offered` is `secret`, in time that does not depend on how much of it is right.
 *
 * An empty or absent secret is never a match, so a caller cannot get in by offering nothing.
 * Compared as bytes rather than characters: `Buffer.from` is what `timingSafeEqual` takes, and a
 * multi-byte character would otherwise make two different strings look the same length.
 */
export function secretMatches(offered: string | null | undefined, secret: string): boolean {
  if (!secret) return false;
  const a = Buffer.from(offered ?? "");
  const b = Buffer.from(secret);
  // Length first: timingSafeEqual throws on a mismatch rather than answering false, and a throw
  // out of a route guard is a 500 where a 401 belongs.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The bearer token a request offers, or null. The scheme is matched case-insensitively, as HTTP says. */
function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  return /^Bearer\s+(.*)$/is.exec(header)?.[1] ?? null;
}

/**
 * The refusal a cron route should answer with, or null when the caller may proceed.
 *
 * `job` names the route in the log line, so a 503 in the deployment's logs says which schedule
 * stopped running rather than only that one did.
 */
export function refuseCron(req: Request, job: string): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error(`[cron] CRON_SECRET is not set: refusing to ${job}`);
    return apiError(503, "Not configured.");
  }
  if (!secretMatches(bearer(req), secret)) return apiError(401, "No.");
  return null;
}
