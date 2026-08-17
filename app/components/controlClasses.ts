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

/** GLASS — the material. Border, fill, blur, shadow. */
export const glassClassName =
  "border border-[var(--glass-border)] bg-[var(--glass-bg-solid)] " +
  "[backdrop-filter:blur(var(--blur-glass))] [-webkit-backdrop-filter:blur(var(--blur-glass))] " +
  "[box-shadow:var(--shadow-card)] text-label dark:border-[var(--glass-border-control)]";

/** CONTROL — the size and the type. */
export const controlSizeClassName =
  "h-[var(--control-h)] [font-family:var(--font-main)] " +
  "[font-size:var(--fs-control-label)] [font-weight:var(--fw-button)]";

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
  "[transition:box-shadow_var(--dur-fast)_var(--ease-smooth),border-color_var(--dur-fast)_var(--ease-smooth),transform_var(--dur-fast)_var(--ease-smooth)]",
  "hover:[box-shadow:var(--shadow-elevated)]",
  "[&_svg]:block [&_svg]:shrink-0",
  "disabled:opacity-55 disabled:cursor-not-allowed",
  "aria-disabled:opacity-55 aria-disabled:cursor-not-allowed",
].join(" ");
