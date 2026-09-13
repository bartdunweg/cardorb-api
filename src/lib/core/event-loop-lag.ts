import { monitorEventLoopDelay } from "node:perf_hooks";

/** Over this, a second in which the server could not start anything else is written down. */
const BLOCKED_MS = 250;

/**
 * A log line whenever this instance's event loop was held for a quarter of a second or more.
 *
 * A read of one row by its key, 0.1 ms in Postgres on average and 21 ms at worst over 9,500 calls,
 * took 3.8 to 7.7 s as the API timed it on 2026-09-13 (`[timing] store cardsVersion`). The time
 * was spent before the query reached the database or after its answer came back, which is what a
 * busy event loop looks like from inside one request: every await waits its turn. Whether that is
 * what happened is what this line is for. Read beside the `[timing]` lines of the same second.
 */
export function watchEventLoop(): void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  setInterval(() => {
    const worst = Math.round(delay.max / 1e6);
    if (worst >= BLOCKED_MS) console.info(`[timing] event loop blocked ${worst}ms`);
    delay.reset();
  }, 1000).unref();
}
