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
  noDatabase: { status: 503, error: "This deployment has no database configured." },
} as const;

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
 * The collection could not be built — the store or a catalogue was
 * unreachable — and nothing should cache that. A 503 rather than an empty
 * 200: an app that got `[]` would show a person their collection is gone.
 */
export function unavailable(): NextResponse<ApiError> {
  return apiError(503, "The collection could not be read. Try again in a moment.", undefined, {
    headers: { "Cache-Control": "no-store" },
  });
}
