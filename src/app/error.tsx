"use client";

import Navbar from "@/components/shared/Navbar";
import RouteError from "@/components/shared/RouteError";

/**
 * The error boundary for everything outside the signed-in group.
 *
 * There was none. `(app)/error.tsx` covers the collection and
 * `(app)/collection/browse/error.tsx` covers one route inside it, so every
 * signed-in screen had a boundary and every public one had nothing: the
 * landing page, /brand, /privacy, /terms, /login, /signup and /user/<name>
 * all fell through to Next's built-in error page. That page is unstyled, has
 * no way back, and does not say the site it belongs to — and /user/<name> is
 * the address shared links point at, so it is the one most likely to be the
 * first thing somebody ever sees of this site.
 *
 * A boundary here rather than at the root of the tree keeps the failure the
 * size of the thing that failed, the same argument (app)/error.tsx makes.
 *
 * ── Why this draws its own chrome ──────────────────────────────────────────
 *
 * `RouteError` is the content, not the page: it renders a <section> and
 * nothing around it. On the signed-in side that is right, because the group's
 * layout already supplies the shell. Out here the root layout deliberately
 * supplies neither a nav nor the landmark — see app/layout.tsx for why the
 * landmark moved down to each screen — so this file has to draw both, in the
 * order SigninShell draws them: navigation first, then <main>, so the skip
 * link lands after the navigation rather than in front of it.
 *
 * Not SigninShell itself, which would be the obvious reuse: it renders its own
 * <h1> from a `title` prop and `RouteError` renders one too, and two <h1>s on
 * one page is the kind of thing this boundary exists to avoid rather than add.
 *
 * ── What this deliberately is not ──────────────────────────────────────────
 *
 * Not `global-error.tsx`. That one catches a throw in the root layout itself,
 * which means it has to render its own <html> and <body> — including the theme
 * class that ThemeProvider normally puts there, or the page arrives in the
 * wrong colour scheme while telling somebody something went wrong. That is a
 * real thing to get right and a different one from this; a root layout that
 * throws is also much rarer than a page that does. Left out on purpose.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="-mt-[var(--main-pad-top)]">
      <Navbar />
      <main
        id="main-content"
        className="flex flex-col items-center justify-center min-h-screen p-[var(--page-pad-x)]"
      >
        <RouteError
          error={error}
          reset={reset}
          title="Something went wrong"
          description="This page didn't load. The rest of the site is fine."
          backHref="/"
        />
      </main>
    </div>
  );
}
