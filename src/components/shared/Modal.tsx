"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  Modal as UntitledModal,
  ModalOverlay,
} from "@/components/application/modals/modal";
import { CloseButton } from "@/components/base/buttons/close-button";

/**
 * The dialog shell: the overlay, the panel, the scroll lock, the focus trap and
 * the way in and out.
 *
 * This was 404 lines of our own until it was not. It hand-rolled a portal, a
 * focus trap with its own `FOCUSABLE` selector and visibility predicate, `inert`
 * on the backdrop's siblings, a scroll lock, Escape, click-outside and the
 * enter/exit motion — every one of which React Aria already had, and which
 * Untitled UI already wraps in `application/modals/modal`.
 *
 * The argument for keeping ours was that it was battle-tested. The file's own
 * header was the argument against: it documented a keyboard trap it had shipped,
 * where every filter and view sheet below 1000px — which includes a desktop user
 * at 200% zoom — could not be tabbed out of, because the selector omitted form
 * controls and never tested whether a candidate was visible. React Aria has
 * neither failure mode. Accessibility we would otherwise maintain ourselves is
 * the whole reason this project uses Untitled UI; this was the one place we had
 * opted out of it, and it cost exactly what the rule predicts.
 *
 * What is still ours, and why:
 *
 * - **`--lock-vw`.** React Aria stops the page scrolling; it does not tell the
 *   stylesheet how wide the viewport was when it did. The bar along the bottom
 *   of a phone is `position: fixed` and measures itself against the viewport, so
 *   it lost four pixels the moment a card opened and got them back on close — a
 *   flinch under your thumb. `tabbarClasses.ts` reads this to stop that.
 * - **The two variants.** A panel that scales up in the middle, and a drawer
 *   from the right on a desktop that becomes a sheet from the bottom on a phone.
 *   Untitled UI's overlay centres and has no drawer, so the geometry is passed
 *   in rather than taken.
 * - **`onClose` firing after the exit, not at its start.** See `ExitSignal`.
 * - **The `modal` / `modal-scroll` / `modal-close` class names.**
 *   `cardModalClasses.ts` and `Sheet.tsx` reach into this markup with
 *   `[&_.modal-scroll]:` descendant variants, because Modal owns those elements
 *   and takes no className for them. They are a contract, and dropping one is
 *   silent — the rule simply stops matching.
 *
 * What is gone: `FOCUSABLE` and `isVisible` (React Aria's problem now), the
 * `onOpened` prop (no consumers, ever), and the imperative `motion` spring. The
 * enter and exit are Untitled UI's own CSS transitions, driven by React Aria's
 * `data-entering` / `data-exiting`, which is what R-STYLE-006 asks for — where
 * it is even, take theirs. It is a curve rather than a spring, so the panel
 * arrives slightly differently. That is the one visible change in this file.
 */

/**
 * Calls back once the dialog has actually left the DOM.
 *
 * React Aria signals a close at the *start* of the exit animation and keeps the
 * overlay mounted until that animation finishes. Every other consumer can live
 * with the early signal, but `CardModal` calls `router.back()` in `onClose`:
 * fired at the start, the route unmounts mid-animation and the card vanishes
 * rather than leaving. The old imperative version got this right by chaining off
 * `animate().then()`, and it is the one contract of the old file worth keeping.
 *
 * A child that reports its own unmount is the reliable way to observe the end of
 * an exit React Aria owns — `ModalOverlay` has no `onExitComplete`.
 *
 * It is not the *only* way it can be reached, though, and it must not be: React
 * Aria decides an exit is over by asking the element for its running animations,
 * and an environment without `Element.getAnimations` — jsdom, and any browser
 * where the animation never starts — would leave the dialog waiting for an event
 * that is not coming, with the consumer never told it closed. So there is a
 * timer alongside, set just past the 200ms exit. Whichever arrives first wins;
 * `owed` makes sure onClose runs exactly once either way.
 */
function ExitSignal({ onGone }: { onGone: () => void }) {
  const latest = useRef(onGone);
  // Kept current in an effect rather than during render: the unmount cleanup
  // below must see the last *committed* callback, and a ref written while
  // rendering is a write React is entitled to throw away.
  useEffect(() => {
    latest.current = onGone;
  });
  useEffect(() => () => latest.current(), []);
  return null;
}

/**
 * The viewport as it is right now, scrollbar and all, published for the
 * stylesheet. Which fixed elements care is a layout question, so it is handed
 * over rather than decided here — `tabbarClasses.ts` is the one that reads it.
 */
function useLockViewportWidth(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const was = root.style.getPropertyValue("--lock-vw");
    root.style.setProperty("--lock-vw", `${window.innerWidth}px`);
    return () => {
      // Back to nothing, so the bar goes back to measuring the live viewport and
      // keeps following a rotation or a resize.
      if (was) root.style.setProperty("--lock-vw", was);
      else root.style.removeProperty("--lock-vw");
    };
  }, [open]);
}

/**
 * The scrim, which is ours and not Untitled UI's.
 *
 * Theirs is `bg-overlay/70` over a 6px blur: a dark wash you read the page
 * through. Ours is almost no tint over a 10px blur, so the page behind goes
 * genuinely soft and the panel is the only thing in focus. Measured rather than
 * argued — visual/owner.spec.ts put the two side by side and 86% of the pixels
 * moved, which is what a different treatment of the whole viewport looks like,
 * not a rounding difference. This is the one place R-STYLE-006's "earn the
 * exception with the identity" applies to this file.
 *
 * The blur radius is a token because it is a design value; the near-zero black
 * is written here because it is not a colour anybody picks, it is the carrier
 * the blur composites against.
 */
const SCRIM = "[background:rgba(0,0,0,0.02)] [backdrop-filter:blur(var(--blur-scrim))]";

/**
 * Where the dialog sits, per variant.
 *
 * Untitled UI's overlay centres on a desktop and rises from the bottom edge on a
 * phone, with its own horizontal padding and a clamped vertical inset. Both
 * variants here override that geometry rather than inherit it, because a drawer
 * is not a centred box and a card is worth the whole screen. The classes merge
 * through `cx`, so these win the conflicts they name and nothing else moves.
 */
const OVERLAY = {
  center: `${SCRIM} items-center justify-center p-0 sm:p-0 [--modal-pt:0px] [--modal-pb:0px]`,
  right:
    `${SCRIM} items-center justify-end p-6 sm:p-6 [--modal-pt:0px] [--modal-pb:0px] ` +
    "max-sm:p-0 max-sm:items-end max-sm:justify-stretch",
} as const;

/**
 * The panel's own surface. `bg-glass-solid` and a hairline, which is what the
 * hand-rolled version painted. Untitled UI's `bg-primary` and its corner radius
 * are overridden rather than taken, because the frosted panel is half of this
 * product's identity (R-STYLE-007) and every caller already states the radius it
 * wants; `Sheet` re-states a solid background for itself, and says why.
 */
const PANEL = "modal border border-secondary bg-glass-solid rounded-none shadow-none";

export default function Modal({
  open,
  onClose,
  label,
  variant = "center",
  className = "",
  children,
}: {
  open: boolean;
  /** Called once the exit animation has finished, not when it starts. */
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  variant?: "right" | "center";
  className?: string;
  children: ReactNode;
}) {
  // `shown` is derived, not mirrored. The dialog is up when the consumer says it
  // is *and* an exit the user asked for is not already playing — which is what
  // lets Escape animate out before `onClose` tells the consumer, and the route
  // under a card modal is pulled away.
  const [closing, setClosing] = useState(false);
  const shown = open && !closing;

  // `closing` is cleared by a change of `open`, and by nothing else.
  //
  // The first version cleared it when the exit finished, which is wrong for the
  // one consumer whose `open` is a literal `true`: CardModal, where the
  // intercepting route's existence is the open state and onClose is a
  // navigation rather than a setState. Clearing it there put `open && !closing`
  // straight back to true, and the card re-mounted and played its entrance
  // before the route finally went. The other five call sites close themselves
  // with a setState in the same React batch and never saw it.
  //
  // React's documented way to adjust state when a prop changes, rather than an
  // effect: it settles in the same render instead of painting the wrong thing
  // first.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setClosing(false);
  }
  // Whether this close came from inside — Escape, the backdrop, the close
  // button — and therefore still owes the consumer an onClose. A plain unmount
  // owes nothing: CardModal would navigate on its own teardown.
  const owed = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLockViewportWidth(shown);

  const handleGone = useCallback(() => {
    if (fallback.current) {
      clearTimeout(fallback.current);
      fallback.current = null;
    }
    if (!owed.current) return;
    owed.current = false;
    onClose();
  }, [onClose]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) return;
      owed.current = true;
      setClosing(true);
      // Just past the exit's 200ms. See ExitSignal for why this is here at all.
      if (fallback.current) clearTimeout(fallback.current);
      fallback.current = setTimeout(handleGone, 250);
    },
    [handleGone],
  );

  useEffect(() => () => void (fallback.current && clearTimeout(fallback.current)), []);

  return (
    <ModalOverlay
      isOpen={shown}
      onOpenChange={handleOpenChange}
      isDismissable
      className={OVERLAY[variant]}
    >
      <UntitledModal className={`${PANEL} ${className}`.trim()}>
        {/* A real box, not `display: contents`. That was the first thing tried
            here — it would have made the panel and the dialog one element — and
            it fails in a way jsdom cannot see: React Aria moves focus to the
            dialog itself, and a box-less element cannot take focus, so opening
            the filter sheet left focus on <body> with the sheet unreachable.
            visual/owner.spec.ts caught it at 390px. Untitled UI's own structure
            is a surface with a content region inside it, and that is why. */}
        <Dialog aria-label={label} className="h-full">
          <ExitSignal onGone={handleGone} />
          <CloseButton
            label="Close"
            size="md"
            className="modal-close absolute top-6 right-6 z-10 cursor-pointer"
          />
          <div className="modal-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        </Dialog>
      </UntitledModal>
    </ModalOverlay>
  );
}
