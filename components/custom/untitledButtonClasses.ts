"use client";

import { styles } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * Untitled UI's button, as a class string, for the elements that cannot be its
 * component.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * Almost every button in this app is `<Button>`. Five call sites cannot be,
 * and they are worth naming because "just use the component" is the obvious
 * objection to this file. This is the whole list:
 *
 *   - **`<summary>`** — FilterSheet and ViewSheet are `<details>/<summary>`, and
 *     the open/closed behaviour is the element's own. A React Aria Button
 *     cannot be a `<summary>`.
 *   - **`<span aria-hidden>`** — CardNav's disabled ends and PublicCardDialog's
 *     are deliberately not buttons: there is nowhere to go, and a real disabled
 *     button would still be an element a screen reader walks past announcing
 *     nothing useful.
 *   - **`<label>`** — AvatarPicker's trigger is the label of a file input, which
 *     is what makes the whole control keyboard-reachable without JavaScript.
 *   - **A button that has to be focused from code** — CardAddDialog's "Change".
 *     That dialog moves focus by hand on every state change, which needs a ref
 *     on the real element, and the vendored Button is typed as a plain call
 *     signature whose props carry no `ref`.
 *
 * If you are about to add a sixth, it belongs on that list or it belongs in the
 * component.
 *
 * ── This reads the recipe. It used to copy it. ─────────────────────────────
 *
 * Until 2026-08-21 the three class strings below were pasted out of
 * `button.tsx` character for character, with a test asserting the copy had not
 * drifted. The reason given was a real one: `button.tsx` is `"use client"`, so
 * a **server** component importing `styles` from it gets Next's client-
 * reference proxy rather than the object, `styles.common` is `undefined` at
 * prerender, and /_not-found died on exactly that.
 *
 * But that was one file. Every other consumer was already a client component,
 * where the import is ordinary. `app/not-found.tsx` renders `<Button>` now — a
 * server component may *render* a client component, it just cannot read a value
 * out of one — and with it gone the copy had no reason left to exist.
 *
 * So this file imports the recipe, `"use client"` states the constraint that
 * makes that safe, and a copy that could drift is replaced by one that cannot.
 * `untitledButtonClasses.test.ts` is deleted with it: it existed only to police
 * the copy, and there is nothing left to police.
 */

type Color = keyof typeof styles.colors;
type Size = keyof typeof styles.sizes;

/**
 * `no-underline` because the component sets it from a prop, and a bare class
 * string has no prop. Every consumer here is a link, a summary or a label.
 */
export function untitledButton({
  color = "secondary",
  size = "md",
  className = "",
}: { color?: Color; size?: Size; className?: string } = {}) {
  return cx(
    styles.common.root,
    styles.sizes[size].root,
    styles.colors[color].root,
    "no-underline",
    className,
  );
}

/** Icon-only, square, for the chevrons and the close buttons. */
export function untitledIconButton({
  color = "secondary",
  size = "md",
  className = "",
}: { color?: Color; size?: Size; className?: string } = {}) {
  return untitledButton({ color, size, className: cx("aspect-square p-2.5", className) });
}
