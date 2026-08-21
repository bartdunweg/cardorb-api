/**
 * How /settings/password learns which of its two callers it is serving.
 *
 * That screen is both where a recovery link lands and where somebody signed in
 * changes their password on purpose. The second should be asked for the current
 * password; the first cannot possibly supply it, which is why they are there.
 * `app/auth/confirm/route.ts` is the only place that knows which happened — it
 * receives `type=recovery` and exchanges it — and it can write a cookie, which a
 * Server Component cannot. See ADR-0082.
 *
 * **A UX signal, not a security boundary, and the distinction is what makes it
 * safe.** Anybody can set a cookie in their own browser, so this cannot be
 * trusted to *prevent* anything and does not have to be: whether the current
 * password is actually required is enforced by Supabase, on its own server, from
 * whether `current_password` was sent. Forging this marker draws the wrong form.
 * It does not get anybody past a check.
 *
 * Short-lived, because nothing clears it: the page that reads it is a Server
 * Component and cannot write cookies either. Ten minutes is long enough to
 * follow a link and choose a password, and short enough that it is gone before
 * the next deliberate visit to the same screen.
 *
 * In its own file rather than exported from the route: a page importing a value
 * out of a `route.ts` pulls that route's module into the page's graph for one
 * string, and the two files that share this are a route handler and a page with
 * nothing else in common.
 */
export const RECOVERY_MARKER = "orb-recovery";

/** Ten minutes, in seconds. */
export const RECOVERY_MARKER_MAX_AGE = 10 * 60;

/** Only the path that reads it, so it rides on no other request. */
export const RECOVERY_MARKER_PATH = "/settings/password";
