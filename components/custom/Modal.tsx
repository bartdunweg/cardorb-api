"use client";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { animate } from "motion";
import { XClose } from "@untitledui/icons";
import { SPRING_MODAL, DUR_NORMAL, DUR_SLOW, prefersReducedMotion } from "@/lib/core/motion";
import { Button as UntitledButton } from "@/components/base/buttons/button";

/**
 * Hold the page still while a dialog is over it.
 *
 * `overflow: hidden` on the body alone is not enough, and the way it fails is
 * loud: the rule propagates to the viewport, the document stops being
 * scrollable, and the browser clamps the scroll position to zero. Open a card
 * from halfway down /cards and everything behind the modal snapped to the top,
 * then snapped back on close.
 *
 * So the body is pinned where it already was (fixed, offset by the scroll it
 * had) and the offset is handed back to the scroller on release. Nothing
 * moves, and the page is genuinely locked rather than merely overflowing.
 */
/**
 * What counts as focusable inside a dialog, and what counts as *there*.
 *
 * Both halves were wrong, and together they made every filter and view sheet a
 * keyboard trap below 1000px — which includes a desktop user at 200% zoom.
 *
 * The selector used to be
 * `a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])`.
 *
 * 1. **No form controls.** `input`, `select` and `textarea` were missing, so in
 *    `CardAddDialog` and the card modals `first` and `last` were computed over
 *    the wrong set and the Tab wrap landed in the wrong place.
 *
 * 2. **No visibility test.** `querySelectorAll` filters on the `disabled`
 *    *attribute*, not on whether an element is rendered. `Sheet` hides the
 *    modal's close button with a Tailwind `hidden` class — `display: none` —
 *    so the selector still returned it, `focusables()[0].focus()` targeted it,
 *    and focusing a `display:none` element does nothing. `inert` on the
 *    backdrop's siblings had already thrown focus off the trigger to `<body>`,
 *    so every subsequent Tab took the `!modal.contains(active)` branch,
 *    called `preventDefault()`, and re-focused the same invisible button.
 *    Focus never moved again. Escape still closed the sheet, so it was
 *    escapable — but nothing inside it was reachable.
 *
 * `getClientRects()` rather than `offsetParent`: `offsetParent` is null for a
 * `position: fixed` element that is perfectly visible, which this dialog has.
 * `visibility` is checked separately because a `visibility: hidden` element
 * still has rects and still is not focusable.
 *
 * Exported so the rule can be tested on its own — see Modal.test.ts. The bug
 * was a predicate, not a component.
 */
export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function isVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  return el.ownerDocument.defaultView?.getComputedStyle(el).visibility !== "hidden";
}

function lockScroll(): () => void {
  const y = window.scrollY;
  const { body } = document;
  // The width the page has *with* its scrollbar. Hiding the overflow takes the
  // scrollbar away, which hands every column a dozen more pixels and reflows
  // the grid behind the dialog; pinning the width means nothing reflows at all.
  // On a trackpad Mac there is no gutter to lose and this is simply the width.
  const width = document.documentElement.clientWidth;
  /**
   * The viewport as it is *right now*, scrollbar and all.
   *
   * Pinning the body stops the page scrolling, which takes the scrollbar away,
   * which narrows the viewport — and a `position: fixed` element measures
   * itself against the viewport, not against the body we just pinned. So the
   * bar along the bottom lost four pixels the moment a card was opened and got
   * them back when it closed: a flinch under your thumb, in the one place on a
   * phone you are already looking.
   *
   * Handed to the stylesheet rather than fixed here, because which fixed
   * elements care is a layout question. See --lock-vw in tabbar.css.
   */
  const vw = window.innerWidth;
  const root = document.documentElement;
  const was = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    vw: root.style.getPropertyValue("--lock-vw"),
  };
  root.style.setProperty("--lock-vw", `${vw}px`);
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${y}px`;
  body.style.width = `${width}px`;
  return () => {
    body.style.overflow = was.overflow;
    body.style.position = was.position;
    body.style.top = was.top;
    body.style.width = was.width;
    // Back to nothing, so the bar goes back to measuring the live viewport and
    // keeps following a rotation or a resize.
    if (was.vw) root.style.setProperty("--lock-vw", was.vw);
    else root.style.removeProperty("--lock-vw");
    window.scrollTo(0, y);
  };
}

/**
 * The dialog shell: the overlay, the panel, the scroll lock, the focus trap and
 * the way in and out.
 *
 * All of that was written once for the connect panel and would have been
 * written a second time for the card detail, which is how two dialogs on one
 * site end up trapping focus differently. Everything that is the same about
 * every dialog lives here; what each one puts inside it does not.
 *
 * Two variants, and they are the two shapes a dialog on this site takes: a
 * drawer that comes in from the right on a desktop and up from the bottom on a
 * phone, and a panel that scales up in the middle. Anything else would be a
 * third way to open the same thing.
 */
export default function Modal({
  open,
  onClose,
  label,
  variant = "center",
  className = "",
  onOpened,
  children,
}: {
  open: boolean;
  /** Called once the exit animation has finished, not when it starts. */
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  variant?: "right" | "center";
  className?: string;
  /** Runs after the panel is in, for a dialog with content of its own to animate. */
  onOpened?: () => void;
  children: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  /** What puts the page back where it was. Held across open, close and unmount. */
  const unlockRef = useRef<(() => void) | null>(null);

  // Where the panel comes from, and the resting value of that same function.
  // Both sides have to be written in the same function: animating to "none"
  // gives motion nothing to interpolate towards, and the whole animation
  // (opacity included) is dropped, which leaves the panel invisible.
  //
  // A function rather than a value, because the drawer's direction depends on
  // the viewport at the moment it opens: a phone rotated mid-visit should not
  // close upward.
  const enterFrom = useCallback(
    () =>
      variant === "center"
        ? "scale(0.97)"
        : window.innerWidth <= 767
          ? "translateY(100%)"
          : "translateX(20px)",
    [variant],
  );
  const settled = variant === "center" ? "scale(1)" : "translate(0, 0)";

  const animateOpen = useCallback(() => {
    const el = modalRef.current;
    const overlay = overlayRef.current;
    if (!el || !overlay) return;
    unlockRef.current ??= lockScroll();
    // The imperative animate() calls bypass CSS reduced-motion rules, so guard
    // explicitly: jump straight to the settled state.
    if (prefersReducedMotion()) {
      el.style.opacity = "1";
      el.style.transform = "none";
      overlay.style.opacity = "1";
      onOpened?.();
      return;
    }
    // The blur is static in CSS and this fades the element carrying it, which
    // fades the blur with it: an element with a backdrop-filter and an opacity
    // below one composites the whole effect at that opacity. Animating the
    // radius instead would repaint everything behind the overlay per frame,
    // which is the one version of this that is genuinely unaffordable.
    //
    // It used to be deferred until the panel had finished springing, on the
    // grounds that a live backdrop-filter costs a full re-blur on every frame
    // anything above it moves. That measurement is real, and the deferral still
    // looked wrong: the panel arrived, sat there, and the background dimmed a
    // beat later. A quarter second of expensive frames buys an effect that
    // reads as one movement, so it is paid.
    animate(overlay, { opacity: [0, 1] }, { duration: DUR_SLOW });
    animate(el, { opacity: [0, 1], transform: [enterFrom(), settled] }, SPRING_MODAL);
    onOpened?.();
  }, [enterFrom, settled, onOpened]);

  const requestClose = useCallback(() => {
    const el = modalRef.current;
    const overlay = overlayRef.current;
    if (!el || !overlay) return;
    // Escape pressed twice inside the ~200ms exit would otherwise start two
    // animations and call onClose twice.
    if (closingRef.current) return;
    closingRef.current = true;
    const finish = () => {
      unlockRef.current?.();
      unlockRef.current = null;
      el.style.opacity = "0";
      overlay.style.opacity = "0";
      onClose();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    animate(overlay, { opacity: 0 }, { duration: DUR_NORMAL });
    animate(el, { opacity: 0, transform: enterFrom() }, { duration: DUR_NORMAL }).then(finish);
  }, [enterFrom, onClose]);

  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    animateOpen();
    // Unmounting while open (route change, parent teardown) must not leave the
    // page permanently scroll-locked: finish() never runs then.
    return () => {
      unlockRef.current?.();
      unlockRef.current = null;
    };
  }, [open, animateOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  // Move focus into the dialog on open, trap Tab inside it, and restore focus
  // to the element that opened it on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const focusables = () => Array.from(modal?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(isVisible);
    // preventScroll, or the page behind jumps. Moving focus into a dialog makes
    // the browser scroll the focused element into view, and it measures that
    // against the document rather than against the fixed layer the dialog sits
    // in: the close button lands "off screen" and the whole page behind the
    // modal shifts a couple of hundred pixels at the moment it opens.
    focusables()[0]?.focus({ preventScroll: true });

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      // Clicking non-focusable content inside the modal moves focus to <body>,
      // which is neither first nor last: without this branch Tab would escape
      // to the page behind the dialog.
      if (!active || !modal?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);

    // Hide the rest of the page from assistive tech and the tab order while the
    // dialog is up. The panel lives inside the backdrop, so mark the backdrop's
    // own siblings: under a parallel route that parent is the layout's slot
    // wrapper rather than the page, which is exactly why this walks up from the
    // element rather than assuming where it sits.
    const backdrop = backdropRef.current;
    const hidden: HTMLElement[] = [];
    if (backdrop?.parentElement) {
      for (const sibling of Array.from(backdrop.parentElement.children)) {
        if (sibling !== backdrop && sibling instanceof HTMLElement) {
          sibling.setAttribute("inert", "");
          hidden.push(sibling);
        }
      }
    }

    return () => {
      document.removeEventListener("keydown", onTab);
      for (const el of hidden) el.removeAttribute("inert");
      // preventScroll on the way out as well, and for the same reason it is on
      // the way in: focusing an element makes the browser scroll it into view.
      // The lock hands the page back to exactly where it was and then this
      // dragged it off again, to wherever the button that opened the drawer
      // happens to sit. On a desktop that button is roughly where you were
      // looking and the jump was invisible; at 390 the page is one long column
      // and "Show more" is a thousand pixels further down, so closing the
      // drawer threw you down the page. Measured: 1400 out, 2462 back.
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === backdropRef.current || target === overlayRef.current) {
      requestClose();
    }
  };

  // No document to portal into on the server. `open` is false there anyway —
  // a dialog is never up on a first paint — so this is a guard for the type
  // rather than a branch anyone reaches.
  if (!open || typeof document === "undefined") return null;

  /**
   * Into the body, not where it was written.
   *
   * The backdrop is fixed with z-index 1000, which beats the bottom bar's 900
   * — but only if the two are being compared in the same stacking context. A
   * dialog opened from a control inside the toolbar was nested under
   * .cards-intro, which lifts itself with position and a z-index so its filter
   * panels can escape the card; inside that context 1000 means nothing to a bar
   * outside it, and the sheet's own buttons sat under the tab bar and could not
   * be pressed.
   *
   * The dialogs that worked did so by accident of where they are mounted: the
   * card modal is a parallel route rendered beside <main>, and the add dialog
   * sits at the top of CardsView. A dialog should not depend on its caller
   * being careful about that, so it portals.
   *
   * React context still crosses a portal, so nothing above needs to change.
   */
  // display:none/.is-open used to gate visibility in CSS; `open` already
  // gates the whole render above (return null), so the backdrop is always
  // visible whenever it exists — the toggle was dead weight once that guard
  // existed. flex unconditionally, same visible result. "modal-backdrop" and
  // "modal-overlay" are fully gone (no other stylesheet reached them by
  // name); "modal"/"modal-scroll"/"modal-close" stay below because cards.css
  // (not yet migrated) still does — .modal--card .modal-scroll,
  // .modal--sheet .modal-close, and the `className` prop's variant classes
  // (modal--card/-card-add/-sheet) presuppose these exact names exist to
  // scope under. Remove them only once cards.css's own migration rewrites
  // those selectors.
  const backdropClassName =
    variant === "right"
      ? "fixed inset-0 z-[var(--z-modal)] flex items-center justify-end p-6 max-sm:p-0 max-sm:items-end max-sm:justify-stretch"
      : "fixed inset-0 z-[var(--z-modal)] flex items-center justify-center";

  return createPortal(
    <div className={backdropClassName} ref={backdropRef} onClick={handleBackdropClick}>
      <div
        ref={overlayRef}
        className="absolute inset-0 opacity-0 [background:rgba(0,0,0,0.02)] [backdrop-filter:blur(var(--blur-scrim))]"
      />
      {/* The dialog is the panel, not the backdrop: on the backdrop the role
          covers the overlay too, so the whole screen becomes the dialog and the
          click-outside-to-close target sits inside the thing it closes. */}
      <div
        // bg-glass-solid rather than the two hand-written rgba() values this
        // carried (white at 0.8, #222 at 0.8). They were the only colours left
        // in product code that named themselves instead of a token, and what
        // they were describing is exactly what --color-glass-solid is for. The
        // values shift slightly with it: 0.9 rather than 0.8 in light, and
        // opaque rgb(37,37,39) rather than 0.8 in dark.
        className={`modal relative border border-secondary bg-glass-solid ${className}`.trim()}
        ref={modalRef}
        style={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {/* `btn btn--icon` lived in the middle of this string, which is why the
            sweep for `className="btn` walked past it. ADR-0018 is that failure
            written down once already; this is it again, found by grepping for
            the token rather than for the pattern. */}
        <UntitledButton
          color="secondary"
          className={`modal-close absolute top-6 right-6 z-10 cursor-pointer
              transition duration-150 ease-in-out
              hover:scale-[1.06]`}
          iconLeading={XClose}
          onPress={requestClose}
          aria-label="Close"
        />
        <div className="modal-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
