"use client";

import { useEffect } from "react";
import Button from "./Button";

/**
 * The shell every error.tsx renders: the code, a heading, a line saying what
 * failed, and the two ways out.
 *
 * One definition rather than one per segment. Four files that each draw the
 * same five elements is how two of them end up with a Go home button and two
 * without, and the routes that need their own boundary differ from the root one
 * in their wording and in nothing else.
 *
 * The wording is the point of having them. A route that reads a list out of
 * Notion or a shelf out of Wikipedia can fail in a way the rest of the site
 * cannot, and "Something went wrong" over a blank page does not say which page
 * is gone or whether trying again is worth anything. Naming the thing that did
 * not load answers both.
 */
export default function RouteError({
  error,
  reset,
  title,
  description,
  /** Where "Go back" goes. Omitted on the root boundary, which has nowhere
   *  more specific to send anyone than home. */
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="flex items-center justify-center min-h-[60vh] p-[var(--card-pad)]">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <p
          className="[font-family:var(--font-main)] [font-size:var(--fs-display)]
            [font-weight:var(--fw-button)] text-tertiary leading-none"
        >
          500
        </p>
        <h1
          className="[font-family:var(--font-main)] [font-size:var(--fs-h2)]
            [font-weight:var(--fw-button)] text-primary [line-height:var(--lh-tight)]"
        >
          {title}
        </h1>
        <p
          className="[font-family:var(--font-body)] [font-size:var(--fs-body-s)]
            text-secondary leading-normal mb-2"
        >
          {description}
        </p>
        <Button onClick={reset} color="primary" size="lg" className="self-center">
          Try again
        </Button>
        {/* Second, and quieter: a route whose data source is down will fail the
            retry too, and then the only useful control on the page is the one
            that leaves. */}
        {backHref && (
          <Button href={backHref} color="secondary" size="lg" className="self-center">
            {backLabel ?? "Go home"}
          </Button>
        )}
        {/* The digest, shown rather than kept.

            Next replaces a production error's message with this hash so a stack
            trace never reaches a public page, which is right. It also meant the
            one string that could tie "it broke for me" to a line in the server
            log was the one thing nobody could see. instrumentation.ts writes the
            same digest on the other side, so quoting it is enough to find the
            error that caused this exact screen. */}
        {error.digest && (
          <p
            className="[font-family:var(--font-body)] [font-size:var(--fs-small)]
              text-tertiary mt-2"
          >
            Reference{" "}
            <code className="[font-family:var(--font-mono)] select-all">{error.digest}</code>
          </p>
        )}
      </div>
    </section>
  );
}
