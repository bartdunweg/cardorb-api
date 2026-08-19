/**
 * The surface every control on this site is made of, written once.
 *
 * It existed twice: `components.css` grouped `.btn`, `.modal-close`,
 * `.cards-search`, `.filter-menu > summary`, `.cards-segmented` and
 * `.cards-views` into one rule, and `FormField.tsx` carried a Tailwind rebuild
 * of the same recipe under a comment reading *"kept in sync by hand"*. Two
 * definitions of one appearance, with a note admitting nothing enforced the
 * agreement.
 *
 * ── Migrated one consumer at a time, on purpose ────────────────────────────
 *
 * A first attempt converted all six and every raw `.btn` in twenty-five files
 * in one commit. The screenshot harness refused it — 152,025 pixels, a fifth of
 * the page — and because everything had moved at once there was no way to tell
 * which of the twenty-five did it. Reverted whole.
 *
 * So: one consumer per portion, screenshots between. While a consumer still
 * uses `.btn` from the stylesheet, the two definitions coexist deliberately —
 * which is exactly the property that makes each step checkable, because a
 * migrated button and an unmigrated one are on screen together and must be
 * pixel-identical.
 */

/**
 * ── Written in utilities, not in escape hatches ────────────────────────────
 *
 * Both recipes below used to be a row of `[property:var(--token)]` strings,
 * because only colour and radius reached Tailwind's `@theme` and everything
 * else in the design system was invisible to a className. The rest of the
 * scales are generated into `@theme` now (ADR-0053), so `text-control-label`,
 * `font-button`, `font-main`, `blur-glass`, `h-control`, `shadow-card` and
 * `shadow-elevated` are ordinary classes.
 *
 * This file is the first consumer, chosen because it is the recipe the most
 * elements on the site wear: if the tokens behind those classes were wrong, a
 * screenshot of any page says so immediately.
 */

/** GLASS — the material. Border, fill, blur, shadow. */
export const glassClassName =
  "border border-[var(--glass-border)] bg-[var(--glass-bg-solid)] " +
  "backdrop-blur-glass shadow-card text-label dark:border-[var(--glass-border-control)]";

/** CONTROL — the size and the type. */
export const controlSizeClassName = "h-control font-main text-control-label font-button";

/**
 * A button, whole.
 *
 * `[&_svg]:` for the two rules that reached the icon inside — kept as a
 * descendant, because the alternative is remembering two classes on every icon
 * in thirty files and the day somebody forgets is the day one chevron squashes.
 *
 * `disabled:` and `aria-disabled:` both, as the CSS had it: a <button> that is
 * off and an <a> pretending to be are two mechanisms for one appearance, and
 * /app/ios's download link is the second kind.
 */
export const buttonClassName = [
  "inline-flex items-center gap-2 self-start no-underline cursor-pointer",
  "px-4 rounded-[var(--radius-btn)]",
  glassClassName,
  controlSizeClassName,
  "transition-[box-shadow,border-color,transform] duration-fast ease-smooth",
  "hover:shadow-elevated",
  "[&_svg]:block [&_svg]:shrink-0",
  "disabled:opacity-55 disabled:cursor-not-allowed",
  "aria-disabled:opacity-55 aria-disabled:cursor-not-allowed",
].join(" ");

/**
 * ── Not migrated yet, and why ──────────────────────────────────────────────
 *
 * `.btn--primary` and `.btn--icon` are still CSS, in components.css. An attempt
 * to move them was reverted, and the reason is worth recording because it is
 * not obvious and it will be met again by whoever picks this up.
 *
 * In CSS, `.btn--primary` *overrides* five declarations of the glass recipe and
 * works only because its rule comes last at equal specificity — the stylesheet
 * says so in its own comment. Tailwind gives no such guarantee: two `bg-*`
 * utilities on one element are resolved by the order Tailwind emits them, which
 * nothing in a className string controls. So a primary button cannot be
 * "buttonClassName plus an override"; it has to be a material chosen instead of
 * the glass, never layered on top of it.
 *
 * Rewriting it that way is straightforward. What is not yet settled is that the
 * screenshots still differed afterwards on one page, localised to the single
 * `aria-disabled` download button on /app/ios — the one ADR-0042 makes
 * deliberately inert. That button is both primary and disabled, so it exercises
 * two overrides at once, and it wants its own portion with its own screenshot
 * rather than riding along with a sweep.
 */
