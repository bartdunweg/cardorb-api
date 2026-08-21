/**
 * The class recipes the public marketing pages share.
 *
 * These lived inside `Home()` in app/page.tsx with a note saying they were
 * kept as named strings rather than components "since every consumer is on
 * this one page". That was true and is not any more: /app/ios is a second
 * marketing page in the same visual language, so the strings moved here
 * rather than being copied — a copy is how two pages start looking almost
 * alike.
 *
 * Still strings, not components. What they describe is typography, not
 * structure: the same `sectionHeading` sits on an `<h1>` in one place and an
 * `<h2>` in another, and a component would have to take the element as a prop
 * to allow that, which is a worse trade than a shared string.
 *
 * No margin-bottom is baked into `eyebrow`: the hero's sits in a flex column
 * that already spaces its children with `gap`, so a bottom margin there would
 * stack on top of the gap instead of matching every other eyebrow's plain
 * `mb-4`. Each consumer states its own bottom margin.
 */

export const eyebrow =
  "mt-0 mx-0 text-tertiary [font-family:var(--font-main)] [font-size:var(--fs-eyebrow)] " +
  "[font-weight:var(--fw-eyebrow)] tracking-[0.08em] uppercase";

export const sectionHeading =
  "m-0 text-primary [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
  "tracking-[-0.045em] [line-height:var(--lh-tight)] [font-size:var(--fs-display)]";

export const sectionBody =
  "m-0 text-secondary [font-family:var(--font-body)] [font-size:var(--fs-body-l)] leading-relaxed";

export const featureIcon =
  "inline-grid w-[42px] h-[42px] place-items-center border border-[var(--color-border-subtle)] rounded-full text-primary";

export const cardHeading =
  "mt-1 mb-0 text-primary [font-family:var(--font-main)] [font-weight:var(--fw-title)] " +
  "tracking-[-0.03em] [line-height:var(--lh-snug)] [font-size:var(--fs-sub)]";

export const cardBody =
  "m-0 text-secondary [font-family:var(--font-body)] [font-size:var(--fs-body)] leading-normal";

/**
 * A navbar link, and the one thing on this list that is not from app/page.tsx's
 * local set: the landing page repeated this string inline four times before
 * there was a second page wanting the same links.
 */
export const navLink =
  "text-secondary [font-family:var(--font-body)] [font-size:var(--fs-small)] no-underline " +
  "[transition:color_150ms_var(--ease-smooth)] hover:text-primary";
