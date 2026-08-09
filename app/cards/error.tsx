"use client";

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
