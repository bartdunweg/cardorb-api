// JS-side motion constants, mirroring the CSS tokens in src/styles/theme.css.
// Use these instead of ad-hoc springs/beziers so JS and CSS animation share
// one motion language.
//
// This file used to export three more — SPRING_PILL, SPRING_BUBBLE and
// EASE_SMOOTH — and describe a chat bubble arriving out of its typing dots and
// a highlight travelling down a connect list. Neither exists in this product;
// they came in with the file and were never used here. The header also pointed
// at app/styles/tokens.css, which does not exist either. Removed rather than
// left as a motion language for a codebase this is not.

/** Modal/sheet entrance spring. */
export const SPRING_MODAL = { type: "spring", stiffness: 300, damping: 30 } as const;

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
