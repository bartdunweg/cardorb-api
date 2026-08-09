// JS-side motion constants, mirroring the CSS tokens in app/styles/tokens.css.
// Use these instead of ad-hoc springs/beziers so JS and CSS animation share
// one motion language.

/** Shared pill/indicator spring (tab pills, connect list highlight). */
export const SPRING_PILL = { type: "spring", stiffness: 380, damping: 32 } as const;

/**
 * Chat bubble entrance.
 *
 * Softer than it was. At 500/34/0.8 a bubble arrived with a snap, which read as
 * hard next to everything else on the page now that it no longer grows out of
 * the typing dots; this settles rather than lands.
 */
export const SPRING_BUBBLE = { type: "spring", stiffness: 260, damping: 30, mass: 1 } as const;

/** Modal/sheet entrance spring. */
export const SPRING_MODAL = { type: "spring", stiffness: 300, damping: 30 } as const;

/** = --ease-smooth: default for almost everything. */
export const EASE_SMOOTH = [0.22, 1, 0.36, 1] as const;

/** = --dur-normal / --dur-slow (in seconds, for motion APIs). */
export const DUR_NORMAL = 0.2;
export const DUR_SLOW = 0.28;

/** Event-time check for imperative animations (motion's animate()). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
