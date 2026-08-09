"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSwipe } from "../hooks/useSwipe";

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
export default function CardNav({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not while something is being typed into: the add form and the search
      // field both live on pages this can be open over.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prev) router.push(`/cards/${prev}`, { scroll: false });
      if (e.key === "ArrowRight" && next) router.push(`/cards/${next}`, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  const swipe = useSwipe(
    () => next && router.push(`/cards/${next}`, { scroll: false }),
    () => prev && router.push(`/cards/${prev}`, { scroll: false }),
  );

  return (
    <div className="card-detail-move" {...swipe}>
      {prev ? (
        <Link href={`/cards/${prev}`} scroll={false} className="btn btn--icon" aria-label="Previous card">
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      ) : (
        <span className="btn btn--icon is-disabled" aria-hidden="true">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </span>
      )}
      {next ? (
        <Link href={`/cards/${next}`} scroll={false} className="btn btn--icon" aria-label="Next card">
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      ) : (
        <span className="btn btn--icon is-disabled" aria-hidden="true">
          <ChevronRight size={20} strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}
