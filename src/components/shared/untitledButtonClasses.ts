"use client";

import { styles } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * Untitled UI's button, as a class string, for the elements that cannot be its
 * component.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * Almost every button in this app is `<Button>`. **Two files** reach for the
 * class string instead, across **five call sites**, and every one of them is an
 * element a React Aria Button cannot be:
 *
 *   - **`<a>`** — CardNav's previous/next are Next `<Link>`s. They navigate, so
 *     they are anchors, and an anchor is not a button. The vendored Button's
 *     `href` renders React Aria's `<a>`, which has no slot for `scroll={false}`.
 *   - **`<span aria-hidden>`** — CardNav's *disabled* ends only. There is
 *     nowhere to go, and a real disabled button is something a screen reader
 *     walks past announcing nothing useful.
 *   - **A button that has to be focused from code** — CardAddDialog's "Change".
 *     That dialog moves focus by hand on every state change, which needs a ref
 *     on the real element, and the vendored Button is typed as a plain call
 *     signature whose props carry no `ref`.
 *
 * ── Two earlier versions of this list were wrong, in different ways ─────────
 *
 * The first named four reasons and counted five call sites. An audit on
 * 2026-08-21 found three of the four untrue: FilterSheet and ViewSheet were not
 * `<details>/<summary>`, AvatarPicker's trigger was not a `<label>`, and
 * PublicCardDialog's arrows were real `<button disabled>` rather than spans.
 *
 * The second version said so honestly and then carried those four files anyway,
 * under the heading "no stated reason", pending a change somebody would make
 * later. This is that change: all eight of those call sites are the component
 * now, and the paragraph excusing them is gone with them. Two of the eight
 * needed Untitled UI's Button directly rather than this app's wrapper — a
 * trigger with `aria-haspopup`, and an icon-only button with no children — and
 * each says so where it stands.
 *
 * That second version also miscounted twice, which is worth recording because
 * it is the same failure as the first: it said "seven files" where there were
 * six, and "seven call sites" where there were thirteen. **Count them before
 * writing a number here.** `grep -rn "untitledButton\|untitledIconButton"
 * components/ app/` is the whole check.
 *
 * If you are about to add a sixth call site, it belongs in one of the three
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
 * string has no prop. Every consumer left here is an anchor or a span.
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
