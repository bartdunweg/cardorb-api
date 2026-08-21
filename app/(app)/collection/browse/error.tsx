"use client";

import RouteError from "@/components/custom/RouteError";

/**
 * Browse's own boundary, because browse fails differently from everything else
 * inside the shell.
 *
 * The rest of these screens read the collection, which fails soft: getCards()
 * catches its own outage and renders an empty state that says so. Browse reads
 * a third-party catalogue that throws on purpose — see ptcg-browse.ts, and
 * ADR-0033 for why a refused request must not arrive looking like an empty
 * answer. Without a boundary here, that deliberate throw would be caught by
 * (app)/error.tsx and blamed on the database, which is the one component that
 * had nothing to do with it.
 */
export default function BrowseError({
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
      title="The card catalogue didn't answer"
      description="Browsing reads pokemontcg.io, which isn't responding right now. Your own collection is unaffected."
      backHref="/collection"
      backLabel="Back to your collection"
    />
  );
}
