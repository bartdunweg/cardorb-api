/**
 * The name of the session cookie, and nothing else.
 *
 * Its own file because of who needs it. The middleware reads this name, and the
 * middleware runs on the edge runtime, where node:crypto does not exist. Import
 * it from guard.ts and the whole module comes along — timingSafeEqual included
 * — and the middleware fails to compile for the sake of one string.
 *
 * So the string lives here, where it costs nothing to import, and guard.ts
 * re-exports it so there is still one obvious place to look.
 */
export const SESSION_COOKIE = "binder_session";
