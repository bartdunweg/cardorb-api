"use client";

/**
 * The collection's error boundary, and it lives here now for a reason worth
 * knowing about.
 *
 * It used to sit in app/cards/, which became a one-line redirect to /collection
 * when the screens got addresses. redirect() works by throwing, and an error
 * boundary is a thing that catches throws — so /cards stopped redirecting and
 * started rendering this instead. An address that is in bookmarks and in the
 * iOS client answered 200 with an error page, which is worse than a 404 because
 * nothing about it says the address moved.
 *
 * Boundaries belong with the screen they are the boundary for. This one now
 * wraps the shell, which is where the collection actually renders.
 */

import RouteError from "../components/RouteError";

/**
 * The collection comes out of a Notion database, which is a service that can be
 * down, rate-limited or reachable with a token that has expired. lib/cards.ts
 * fails soft where it can, so this catches what is left: a shape Notion changed
 * under us, or a render that threw on the way through fifteen hundred rows.
 *
 * A boundary on the segment rather than at the root means the failure stays the
 * size of the thing that failed. Without it this route's 500 is the site's 500.
 *
 * The way home is spelled out because TabBar renders nothing on /cards, so the
 * error page it replaces the collection with would otherwise have no navigation
 * on it at all.
 */
export default function CardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="The collection didn't load"
      description="The cards come from a database that isn't answering right now. The rest of the site is fine."
      backHref="/"
    />
  );
}
