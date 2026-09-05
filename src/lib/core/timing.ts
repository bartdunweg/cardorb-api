/**
 * Where a request spends its time, one line per step in the function's log.
 *
 * A read of the collection is the session check, the rows from Postgres, one
 * cached entry of catalogue facts per set, and the assembly; none of that is
 * visible from outside, where a client sees one number. These lines make each
 * step visible in `vercel logs`, so a slow answer can be traced to the step
 * that was slow rather than guessed at. The web app logs the same shape on its
 * side (`[timing] api GET /stats`), so the two logs read against each other.
 * Cheap enough to leave on: one `console.info` per step.
 */

export function elapsed(since: number): number {
  return Math.round(performance.now() - since);
}

export function logTiming(label: string, ms: number, detail?: string): void {
  console.info(`[timing] ${label} ${ms}ms${detail ? ` ${detail}` : ""}`);
}

/** Runs `work` and logs how long it took under `label`, whether it resolved or threw. */
export async function timed<T>(label: string, work: () => Promise<T>, detail?: string): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    logTiming(label, elapsed(start), detail);
  }
}

/**
 * A cached read that says whether it ran: `load` is the function the cache
 * wraps, and the line says hit or miss by whether it was entered.
 */
export async function timedCache<T>(
  label: string,
  run: (load: () => void) => Promise<T>,
): Promise<T> {
  let ran = false;
  const start = performance.now();
  try {
    return await run(() => {
      ran = true;
    });
  } finally {
    logTiming(label, elapsed(start), ran ? "miss" : "hit");
  }
}
