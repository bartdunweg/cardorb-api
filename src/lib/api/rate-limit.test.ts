import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

/**
 * The limiter, and specifically the parts nothing was reaching.
 *
 * guard.test.ts exercises the happy path from the outside: ten through, the
 * eleventh refused. What it never touched is everything this file exists for —
 * the eviction, and the overflow branch under it. That code is the answer to a
 * flood rotating X-Forwarded-For, which is the one attack that turns a limiter
 * into the thing it was supposed to prevent, and it was running untested in
 * front of every endpoint.
 *
 * `now` is injectable, which is what makes the window testable without waiting
 * a minute and without faking a clock.
 */

describe("the window", () => {
  it("lets maxPerWindow through and refuses the next", () => {
    const limited = createRateLimiter(60_000, 3);
    expect([0, 1, 2].map((i) => limited("a", 1000 + i))).toEqual([0, 0, 0]);
    expect(limited("a", 1003)).toBeGreaterThan(0);
  });

  it("says how many whole seconds until the window frees, never zero when refusing", () => {
    // Hits at 1000 and 1001 fill a window of two; the refusal at 1002 counts
    // too. The oldest hit that still has to leave is 1001, gone at 61001, so a
    // client that waits the 60 s it is told will be let through.
    const limited = createRateLimiter(60_000, 2);
    limited("a", 1000);
    limited("a", 1001);
    expect(limited("a", 1002)).toBe(60);
    expect(limited("a", 61_001)).toBe(0);
    // A refusal in the last millisecond of a window still says one second,
    // because a Retry-After of zero tells a client to try again at once.
    const tight = createRateLimiter(1_000, 1);
    tight("b", 0);
    expect(tight("b", 999)).toBe(1);
  });

  it("forgives once the window has passed", () => {
    const limited = createRateLimiter(60_000, 2);
    limited("a", 1000);
    limited("a", 1001);
    expect(limited("a", 1002)).toBeGreaterThan(0);
    // One millisecond past the window on the oldest hit, and the budget is back.
    expect(limited("a", 61_002)).toBe(0);
  });

  it("counts each key on its own", () => {
    const limited = createRateLimiter(60_000, 1);
    expect(limited("a", 1000)).toBe(0);
    expect(limited("a", 1001)).toBeGreaterThan(0);
    expect(limited("b", 1002)).toBe(0);
  });

  it("keeps a hammered key bounded in memory", () => {
    // The slice at maxPerWindow + 1: a key under constant fire must not grow an
    // entry per request. Observable only through behaviour — it stays blocked.
    const limited = createRateLimiter(60_000, 2);
    for (let i = 0; i < 10_000; i++) limited("a", 1000 + i);
    expect(limited("a", 11_000)).toBeGreaterThan(0);
  });
});

describe("eviction, which is what a rotating flood meets", () => {
  it("drops keys whose hits have all aged out", () => {
    const limited = createRateLimiter(1_000, 5, 10);
    // Twenty distinct keys at t=0, all long expired by the time the cap is hit.
    for (let i = 0; i < 20; i++) limited(`old-${i}`, 0);
    // A fresh key well past the window sweeps them; the sweep is what keeps this
    // from being an unbounded Map.
    expect(limited("new", 10_000)).toBe(0);
    // The proof it swept rather than cleared: the new key still has its budget.
    for (let i = 0; i < 4; i++) expect(limited("new", 10_000 + i)).toBe(0);
    expect(limited("new", 10_005)).toBeGreaterThan(0);
  });

  it("does not un-throttle a blocked key when it has to make room", () => {
    // The branch this file was written for. A key that is over the limit is
    // exactly the state worth keeping: if the overflow path dropped it, a flood
    // that rotates addresses would become the reset lever for the one address
    // being throttled.
    const limited = createRateLimiter(60_000, 2, 5);
    for (let i = 0; i < 3; i++) limited("blocked", 1000 + i);
    expect(limited("blocked", 1004)).toBeGreaterThan(0);

    // Now flood past the cap with live keys, all of them under the limit.
    for (let i = 0; i < 50; i++) limited(`flood-${i}`, 1010 + i);

    // Still blocked, inside the same window.
    expect(limited("blocked", 1100)).toBeGreaterThan(0);
  });

  it("still caps memory when every key is blocked", () => {
    // Nothing is droppable by the first rule, so the second loop has to run and
    // drop blocked keys anyway. The memory cap wins over perfect throttling —
    // the alternative is the OOM the whole mechanism exists to avoid.
    const limited = createRateLimiter(60_000, 1, 5);
    for (let i = 0; i < 40; i++) {
      limited(`k-${i}`, 1000);
      limited(`k-${i}`, 1001);
    }
    // Nothing to assert but that it neither threw nor hung: the eviction ran
    // over a Map where no key qualified for the gentle pass.
    expect(limited("k-0", 1002)).toBeGreaterThan(0);
  });
});
