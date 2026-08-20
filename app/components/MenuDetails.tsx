"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The details/summary dropdown shell FilterMenu and ViewMenu both build: one
 * button, one panel positioned under it, closing on Escape and on an outside
 * click for free from the native element — only the outside-click handler is
 * this component's own.
 *
 * Extracted because the cards.css comment on `.view-menu-panel` already said
 * it plainly: "It borrows .filter-menu's button and panel wholesale — same
 * shell, same position, same outside-click — and only differs in what is
 * inside." Two files drawing the same shell by hand is the same shape this
 * migration extracted Sheet.tsx to end.
 *
 * details/summary rather than a custom popover: it opens on click and on
 * Enter, closes on Escape, and sits in the tab order without a line of
 * keyboard handling. Closing on an outside click is the one thing it does not
 * do itself, and the only handler here.
 */
export function MenuDetails({
  trigger,
  badge,
  panelClassName,
  onToggle,
  children,
}: {
  trigger: ReactNode;
  badge?: ReactNode;
  panelClassName?: string;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // pointerdown, not click. On click, React has already re-rendered and
    // unmounted whatever was pressed by the time this runs, so contains()
    // reports the (now detached) target as outside and the menu shut itself
    // the moment you picked something inside it. pointerdown fires while the
    // target is still there.
    const onDocument = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onToggleOpen = () => onToggle?.(el.open);
    el.addEventListener("toggle", onToggleOpen);
    document.addEventListener("pointerdown", onDocument);
    return () => {
      el.removeEventListener("toggle", onToggleOpen);
      document.removeEventListener("pointerdown", onDocument);
    };
  }, [onToggle]);

  return (
    <details className="filter-menu relative" ref={ref}>
      {/* A button, and built like one: everything but the layout comes from
          .btn's own surface and shape in components.css (the "GLASS
          CONTROL"/"CONTROL" recipe, keyed off `.filter-menu > summary`). */}
      <summary
        className="flex items-center gap-2 px-4 cursor-pointer whitespace-nowrap list-none
          [&::-webkit-details-marker]:hidden [&>svg:first-of-type]:shrink-0
          transition duration-100 ease-linear"
      >
        <span className="inline-flex items-center gap-2">
          {trigger}
          {badge}
        </span>
      </summary>

      <div
        className={`filter-menu-panel absolute z-[5] top-[calc(100%+var(--space-2))] left-0 w-[280px]
          max-w-[min(280px,calc(100vw-2*var(--page-pad-x)))] p-2 border border-[var(--color-border)]
          rounded-orb-md bg-primary [box-shadow:var(--shadow-elevated)]
          [backdrop-filter:blur(var(--blur-glass))] ${panelClassName ?? ""}`}
      >
        {children}
      </div>
    </details>
  );
}

export const filterMenuBadgeClassName =
  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-pill " +
  "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] [font-size:var(--fs-tiny)] " +
  "[font-variant-numeric:lining-nums_tabular-nums]";
