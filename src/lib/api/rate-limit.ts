/**
 * Best-effort in-memory sliding-window rate limiter. Serverless instances are
 * ephemeral so this is per-instance only, but it blunts naive floods without an
 * external dependency. `now` is injectable for tests.
 *
 * Copied from the portfolio it shares a database with, where it has been
 * guarding a contact form. Every awkward line in it was put there by a real
 * failure mode and is worth keeping.
 */
export function createRateLimiter(windowMs: number, maxPerWindow: number, maxKeys = 10_000) {
  const hits = new Map<string, number[]>();

  // Drop keys whose hits have all aged out. Without this the Map only ever
  // grows: an attacker rotating X-Forwarded-For adds a key per request and
  // walks the instance into an OOM.
  const evictExpired = (now: number) => {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  };

  return function rateLimited(key: string, now: number = Date.now()): boolean {
    let recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    // `> maxPerWindow` only needs the newest maxPerWindow + 1 timestamps, so a
    // single hammered key stays O(1) in memory instead of one entry per request.
    if (recent.length > maxPerWindow + 1) recent = recent.slice(-(maxPerWindow + 1));
    // Deleting before setting keeps insertion order = recency order, which is
    // what the overflow eviction below relies on.
    hits.delete(key);
    hits.set(key, recent);
    // Sweeping only when the Map is large keeps the common path O(1).
    if (hits.size > maxKeys) {
      evictExpired(now);
      // Still oversized means a genuine flood of live keys. Clearing the Map
      // would also un-throttle every blocked client, turning a key-rotation
      // flood into the reset lever. Instead, drop keys that are not currently
      // over the limit, least recently seen first; blocked keys are exactly the
      // state worth keeping.
      if (hits.size > maxKeys) {
        let excess = hits.size - maxKeys;
        for (const [k, times] of hits) {
          if (excess <= 0) break;
          if (times.length <= maxPerWindow) {
            hits.delete(k);
            excess--;
          }
        }
        // Everything left is a blocked key; the memory cap still wins.
        for (const k of hits.keys()) {
          if (excess <= 0) break;
          hits.delete(k);
          excess--;
        }
      }
    }
    return recent.length > maxPerWindow;
  };
}
