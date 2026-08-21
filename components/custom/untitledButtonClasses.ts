"use client";

import { styles } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * Untitled UI's button, as a class string, for the elements that cannot be its
 * component.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * Almost every button in this app is `<Button>`. Seven files reach for the
 * class string instead, and this list was rewritten on 2026-08-21 because the
 * one that stood here was wrong in three of its four claims and counted five
 * call sites where there are seven.
 *
 * What it said, and what is actually true:
 *
 *   - It claimed **`<summary>`** — that FilterSheet and ViewSheet are
 *     `<details>/<summary>`, which a React Aria Button cannot be. They are not.
 *     Both render `<button type="button">` opening a `<Sheet>`/`<Modal>`, and
 *     MenuPopover renders the vendored Button for the same job.
 *   - It claimed **`<label>`** — that AvatarPicker's trigger is a file input's
 *     label, keyboard-reachable without JavaScript. It is a
 *     `<button type="button">` inside React Aria's `<FileTrigger>`.
 *   - It claimed **PublicCardDialog's arrows are `<span aria-hidden>`**. They
 *     are real `<button disabled>`.
 *
 * The list that survives inspection:
 *
 *   - **`<a>`** — CardNav's previous/next are `<Link>`s. They navigate, so they
 *     are anchors, and an anchor is not a button.
 *   - **`<span aria-hidden>`** — CardNav's *disabled* ends only. There is
 *     nowhere to go, and a real disabled button is something a screen reader
 *     walks past announcing nothing useful.
 *   - **A button that has to be focused from code** — CardAddDialog's "Change".
 *     That dialog moves focus by hand on every state change, which needs a ref
 *     on the real element, and the vendored Button is typed as a plain call
 *     signature whose props carry no `ref`.
 *
 * That leaves four consumers — FilterSheet (3), ViewSheet (2), PublicCardDialog
 * (2) and AvatarPicker (1) — which are plain `<button>` elements with **no
 * stated reason** not to be `<Button>`. They are not defended here because the
 * defence was untrue. Converting them is its own change; until somebody does,
 * this file is carrying them rather than justifying them.
 *
 * If you are about to add an eighth, it belongs in one of the three real
 * categories above or it belongs in the component.
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
