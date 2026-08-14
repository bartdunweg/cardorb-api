/**
 * The name of the session cookie, and nothing else.
 *
 * Its own file because of who needs it. proxy.ts reads this name, and importing
 * it from guard.ts would drag that whole module in — timingSafeEqual, the key
 * comparison, node:crypto — for the sake of one string.
 *
 * That used to be a hard failure: proxy.ts was middleware.ts, middleware ran on
 * the edge runtime, and node:crypto is not there, so the import did not
 * compile. Next 16 moved the convention to the Node.js runtime and it would
 * compile now. The split stays anyway, because the reason it is a good idea
 * outlived the reason it was mandatory: a proxy sits at the network boundary in
 * front of every matched request, and what it pulls in is what it pays for.
 *
 * So the string lives here, where it costs nothing to import, and guard.ts
 * re-exports it so there is still one obvious place to look.
 */
export const SESSION_COOKIE = "binder_session";

/**
 * Whether a cookie is one of the session's.
 *
 * The name stopped being ours. @supabase/ssr writes `sb-<project-ref>-auth-token`
 * and splits it across `.0`, `.1` and so on when the token is too big for one
 * cookie, so there is no single string left to compare against — which is why
 * this is a predicate rather than the constant it replaces.
 *
 * Deliberately loose, because of who asks. The proxy uses this to decide
 * whether to show a page or a login, and being wrong in the permissive
 * direction costs a redirect that the page itself then makes properly. Being
 * wrong in the strict direction signs somebody out who is signed in.
 */
export const isAuthCookie = (name: string) =>
  name.startsWith("sb-") && name.includes("-auth-token");
