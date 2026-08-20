import { cx } from "@/utils/cx";

/**
 * Untitled UI's button, as a class string, for the buttons that cannot be its
 * component.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * Most buttons in this app became `<Button>` outright. A handful cannot, and
 * they are worth naming because "just use the component" is the obvious
 * objection to this file:
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
 *
 * ── Why the recipe is copied here rather than imported ────────────────────
 *
 * It was imported from the vendored component, which is obviously better, and
 * it does not work: `button.tsx` is `"use client"`, so a **server** component
 * importing `styles` from it gets Next's client-reference proxy rather than the
 * object. `styles.common` is `undefined` at prerender, and /_not-found and
 * /cards both died on it. Read the boundary, not the import graph.
 *
 * So it is copied — and `untitledButtonClasses.test.ts` asserts, character for
 * character, that the copy still equals the vendored source. That is this
 * repository's own answer to the same problem elsewhere: `gen-tokens.mjs
 * --check` fails the build when the generated stylesheet drifts from
 * `tokens.ts`. Not "please keep these in step", but "these cannot drift".
 *
 * The failure being avoided is written down in controlClasses.ts, whose header
 * records two definitions of one appearance with a comment admitting nothing
 * enforced the agreement. A copy with a test is a different thing from a copy
 * with a promise.
 */

/** Copied from components/base/buttons/button.tsx — the test enforces it. */
export const COMMON =
  "group relative inline-flex h-max cursor-pointer items-center justify-center whitespace-nowrap outline-brand transition duration-100 ease-linear before:absolute focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "in-data-input-wrapper:shadow-xs in-data-input-wrapper:focus:!z-50 in-data-input-wrapper:in-data-leading:-mr-px in-data-input-wrapper:in-data-leading:rounded-r-none in-data-input-wrapper:in-data-leading:before:rounded-r-none in-data-input-wrapper:in-data-trailing:-ml-px in-data-input-wrapper:in-data-trailing:rounded-l-none in-data-input-wrapper:in-data-trailing:before:rounded-l-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 in-data-input-wrapper:disabled:opacity-100 " +
  "*:data-icon:pointer-events-none *:data-icon:size-5 *:data-icon:shrink-0 *:data-icon:transition-inherit-all";

export const SIZES = {
  sm: "gap-1 rounded-lg px-3 py-2 text-sm font-semibold before:rounded-[7px] data-icon-only:p-2 in-data-input-wrapper:px-3.5 in-data-input-wrapper:py-2.5 in-data-input-wrapper:data-icon-only:p-2.5",
  md: "gap-1 rounded-lg px-3.5 py-2.5 text-sm font-semibold before:rounded-[7px] data-icon-only:p-2.5 in-data-input-wrapper:gap-1.5 in-data-input-wrapper:px-4 in-data-input-wrapper:text-md in-data-input-wrapper:data-icon-only:p-3",
  lg: "gap-1.5 rounded-lg px-4 py-2.5 text-md font-semibold before:rounded-[7px] data-icon-only:p-3",
  xl: "gap-1.5 rounded-lg px-4.5 py-3 text-md font-semibold before:rounded-[7px] data-icon-only:p-3.5",
} as const;

export const COLORS = {
  primary:
    "bg-brand-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover data-loading:bg-brand-solid_hover " +
    "before:absolute before:inset-px before:border before:border-white/12 before:mask-b-from-0% " +
    "*:data-icon:text-white/60 hover:*:data-icon:text-white/70",
  secondary:
    "bg-primary text-secondary shadow-xs-skeuomorphic ring-1 ring-primary ring-inset hover:bg-primary_hover hover:text-secondary_hover data-loading:bg-primary_hover " +
    "*:data-icon:text-fg-quaternary hover:*:data-icon:text-fg-quaternary_hover",
  tertiary:
    "text-tertiary hover:bg-primary_hover hover:text-tertiary_hover data-loading:bg-primary_hover " +
    "*:data-icon:text-fg-quaternary hover:*:data-icon:text-fg-quaternary_hover",
  "primary-destructive":
    "bg-error-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent outline-error ring-inset hover:bg-error-solid_hover data-loading:bg-error-solid_hover " +
    "before:absolute before:inset-px before:border before:border-white/12 before:mask-b-from-0% " +
    "*:data-icon:text-white/60 hover:*:data-icon:text-white/70",
} as const;
export function untitledButton({
  color = "secondary",
  size = "md",
  className = "",
}: {
  color?: keyof typeof COLORS;
  size?: keyof typeof SIZES;
  className?: string;
} = {}) {
  return cx(
    COMMON,
    SIZES[size],
    COLORS[color],
    // The component sets this from a prop; a bare class string has no prop, and
    // every consumer here is either a link, a summary or a label.
    "no-underline",
    className,
  );
}

/** Icon-only, square, for the chevrons and the close buttons. */
export function untitledIconButton({
  color = "secondary",
  size = "md",
  className = "",
}: {
  color?: keyof typeof COLORS;
  size?: keyof typeof SIZES;
  className?: string;
} = {}) {
  return untitledButton({
    color,
    size,
    className: cx("aspect-square p-2.5", className),
  });
}
