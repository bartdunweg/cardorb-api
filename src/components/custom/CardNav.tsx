"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@untitledui-pro/icons/line";
import { useSwipe } from "@/app/hooks/useSwipe";
import { untitledIconButton } from "@/components/custom/untitledButtonClasses";

/**
 * The way to the card either side of this one, on the routes that have a URL
 * for it.
 *
 * Links rather than buttons, because these cards do have addresses: middle
 * click opens one in a tab, and the intercepting route means a click from
 * inside the dialog stays a dialog. scroll={false} for the reason CardLink
 * gives — the router scrolls to the top before the new dialog mounts, which
 * moves the grid behind it.
 *
 * The arrow keys and a swipe do the same thing. Both are registered here rather
 * than in the dialog, so a card opened as a full page answers to them too.
 */
export default function CardNav({
  prev,
  next,
  /** Defaults to /cards, the original and only route this ever pointed at.
   *  app/(app)/collection/card/[id]/page.tsx passes /collection/card so
   *  prev/next stay inside the collection shell instead of jumping out to
   *  the older, separate /cards route. */
  basePath = "/cards",
}: {
  prev: string | null;
  next: string | null;
  basePath?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not while something is being typed into: the add form and the search
      // field both live on pages this can be open over.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prev) router.push(`${basePath}/${prev}`, { scroll: false });
      if (e.key === "ArrowRight" && next) router.push(`${basePath}/${next}`, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prev, next, router, basePath]);

  const swipe = useSwipe(
    () => next && router.push(`${basePath}/${next}`, { scroll: false }),
    () => prev && router.push(`${basePath}/${prev}`, { scroll: false }),
  );

  return (
    // CardDetail.tsx wraps this in its own .card-detail-move div for
    // positioning; this inner one carries the flex/justify-between that
    // actually spaces the two buttons apart (PublicCardDialog.tsx passes a
    // bare fragment instead of this component, so that positioning has to
    // live one level up — see the comment in CardDetail.tsx).
    <div
      className="card-detail-move flex justify-between pointer-events-none
        [&>*]:pointer-events-auto [&_.is-disabled]:opacity-35 [&_.is-disabled]:pointer-events-none"
      {...swipe}
    >
      {prev ? (
        <Link
          href={`${basePath}/${prev}`}
          scroll={false}
          className={untitledIconButton({ color: "secondary" })}
          aria-label="Previous card"
        >
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      ) : (
        <span
          className={untitledIconButton({ color: "secondary", className: "opacity-50" })}
          aria-hidden="true"
        >
          <ChevronLeft size={20} strokeWidth={1.75} />
        </span>
      )}
      {next ? (
        <Link
          href={`${basePath}/${next}`}
          scroll={false}
          className={untitledIconButton({ color: "secondary" })}
          aria-label="Next card"
        >
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      ) : (
        <span
          className={untitledIconButton({ color: "secondary", className: "opacity-50" })}
          aria-hidden="true"
        >
          <ChevronRight size={20} strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}
