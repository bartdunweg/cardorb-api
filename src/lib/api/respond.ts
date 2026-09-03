import { NextResponse } from "next/server";

/**
 * The one shape every refusal takes, written in one place.
 *
 * Every route under /api/v1 answers a failure with `{ error: string }`: a
 * sentence a person can read, at the status a client can branch on. That was
 * already the convention, but it was a convention held by 102 hand-typed
 * `NextResponse.json({ error: … }, { status: … })` calls, and it had started to
 * drift — one route said `Invalid request` where it meant `Payload too large`,
 * and "no database" was worded four different ways. A helper is how the shape
 * stays one shape: a route that reaches for this cannot invent a fifth.
 *
 * `code` is not here on purpose. The two clients that read this API are the
 * web tool and the iOS app, both of which display the sentence and branch on
 * the status. A machine-readable code would be a second thing to keep in step
 * with the first, for no reader. It can be added as an optional key later
 * without breaking either client, which is the test for adding it at all.
 */
export type ApiError = { error: string };

/**
 * The status-to-sentence pairs that mean the same thing on every route.
 *
 * Where a route has something more specific to say — "That password is not
 * right." — it says that instead. These are the generic ones, the sentences
 * that used to be re-typed and drift.
 */
export const REFUSALS = {
  invalid: { status: 400, error: "Invalid request" },
  signIn: { status: 401, error: "Sign in first." },
  forbidden: { status: 403, error: "Forbidden" },
  tooLarge: { status: 413, error: "Payload too large" },
  notJson: { status: 415, error: "Invalid request" },
  tooMany: { status: 429, error: "Too many requests" },
  /**
   * pokemontcg.io or TCGdex did not answer. 502 rather than 503: the request
   * was fine and this deployment is fine, the party behind it was not. Three
   * routes used to send a slug here ("catalog-unavailable"), the one place a
   * client was handed a token to translate instead of a sentence to show.
   */
  catalogue: { status: 502, error: "The catalogue did not answer. Try again in a moment." },
  noDatabase: { status: 503, error: "This deployment has no database configured." },
} as const;

/**
 * The header every 429 carries: how many whole seconds until one more request
 * would be let through, as createRateLimiter() answers it. A client that gets
 * the status alone can only retry blind.
 */
export const retryAfter = (seconds: number): Record<string, string> => ({
  "Retry-After": String(seconds),
});

/**
 * A refusal, as the response a route returns.
 *
 * `extra` is for the two bodies that legitimately carry more than the
 * sentence: the sign-in route's `unconfirmed: true`, and the CSV import's
 * `header` / `guessed` so the client can ask which column is which. Anything
 * new there is a contract change and belongs in openapi.yaml first.
 */
export function apiError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
  init?: { headers?: HeadersInit },
): NextResponse<ApiError> {
  return NextResponse.json({ error, ...extra }, { status, headers: init?.headers });
}

/** The same, from one of the shared pairs above. */
export function refuse(
  which: keyof typeof REFUSALS,
  init?: { headers?: HeadersInit },
): NextResponse<ApiError> {
  const { status, error } = REFUSALS[which];
  return apiError(status, error, undefined, init);
}

/**
 * The Cache-Control a public read carries: a minute at the CDN, nothing in
 * the browser, and no serving while stale.
 *
 * One string for the four routes under /v1/public/<username>/ so the window
 * cannot drift between them, because the window is the whole privacy
 * mechanism. Nothing purges this host's CDN when a profile turns private —
 * the route handlers are dynamic, so revalidatePath() has no entry to drop,
 * and a purge of the edge cache would need Vercel's API and a token. Sixty
 * seconds, with no stale-while-revalidate, is the longest a collection stays
 * visible after its owner asked for it not to be. It used to be five minutes
 * plus an hour of stale serving.
 */
export const PUBLIC_READ_CACHE = "public, max-age=0, s-maxage=60";

/**
 * Something could not be read — the store or a catalogue was unreachable —
 * and nothing should cache that. A 503 rather than an empty 200: an app that
 * got `[]` would show a person their collection is gone.
 *
 * The sentence is about the collection unless the route says otherwise; the
 * two card-detail routes name the card, since a person reading "the
 * collection could not be read" over one card would go looking for a bigger
 * problem than there is.
 *
 * `headers` is for a keyed route's readHeaders(): without the CORS pair a
 * browser on an allowed origin cannot read the 503 at all, only that
 * something failed. `Cache-Control` stays `no-store` whatever is passed.
 */
export function unavailable(
  sentence = "The collection could not be read. Try again in a moment.",
  headers?: Record<string, string>,
): NextResponse<ApiError> {
  return apiError(503, sentence, undefined, {
    headers: { ...headers, "Cache-Control": "no-store" },
  });
}
