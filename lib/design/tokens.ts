/**
 * The colours, and why each one is the value it is.
 *
 * This is the first half of moving the design system's source of truth out of
 * CSS. It exists now, ahead of the rebuild, for one reason: tokens.css argues
 * every colour by a measured contrast ratio in a comment, and the two test
 * files those comments cite are gone from the repo. So the arguments have been
 * lifted here, where a test can hold them.
 *
 * Nothing consumes this yet — tokens.css is still what the browser reads, and
 * `tokens.test.ts` asserts the two agree. That is deliberate: a value that
 * exists twice is a value that can drift, so the transition is guarded from the
 * first commit rather than at the end of it.
 *
 * ── On the names ───────────────────────────────────────────────────────────
 * These are the names iOS uses, and that is a decision rather than a fashion:
 * an iOS app is coming that reads the same API, and a `Color` extension over
 * there should be a transcription of this file rather than a second vocabulary
 * that has to be kept in step by hand. `label` / `label-secondary` /
 * `label-tertiary` and the grouped-background pair are already what this
 * codebase arrived at independently — light puts the card *above* the page,
 * dark puts it *below* — which is exactly Apple's systemGroupedBackground
 * relationship. Naming it so costs nothing and buys the parity.
 */

/** Every colour is a pair. Neither half is the default; see the plan. */
export type ColourPair = { light: string; dark: string };

export const colour = {
  /**
   * Titles, headings, interactive labels.
   *
   * Dark stays pure white and that is measured rather than a dodge: light's
   * #111111 is 18.56:1 on its card and white on the dark card is 16.84:1, so
   * this tier is already the quieter of the two and there is nothing above
   * white to reach for.
   */
  label: { light: "#111111", dark: "#ffffff" },

  /** Body copy. Dark is 5.62:1 on the card where light is 5.64:1 — matched. */
  labelSecondary: { light: "#666666", dark: "#959595" },

  /**
   * Meta, dates, eyebrows, captions.
   *
   * The most argued value in the file, on both sides. Light: #767676 is 4.54:1
   * on pure white but this tier also renders on the glass card and on the page,
   * where it measured 4.47 and 4.35 — under AA. #737373 is the lightest value
   * that clears 4.5 on all three.
   *
   * Dark: derived at 4.69 on the card and then raised, for the same reason. The
   * counts in the rail sit on the control glass, rgb(37,37,39), where #878787
   * measured 4.26 and failed axe.
   */
  labelTertiary: { light: "#737373", dark: "#8c8c8c" },

  /**
   * A backdrop that carries information without being text — the set logos.
   *
   * WCAG asks 3:1 of a graphic like this and no more, and *no more* is half the
   * requirement: raise it and it stops reading as a backdrop and starts
   * competing with the content in front of it. #b0b0b0 measured 2.3:1 on the
   * glass and failed; this clears three and still recedes.
   */
  labelQuaternary: { light: "#949494", dark: "#676767" },

  /** The page. Painted on body, and what the browser chrome is tinted from. */
  bgGrouped: { light: "#ffffff", dark: "#181818" },

  /** A card. Equal to the page in light (cards read by border/shadow alone,
   *  not colour), below the page in dark — Apple's relationship there still. */
  bgSurface: { light: "#ffffff", dark: "#101010" },

  /**
   * The translucent card surface, before it is composited onto the page.
   *
   * Kept as the raw value rather than as the result, because the result depends
   * on what is behind it and the tests need to do that arithmetic themselves.
   */
  glass: { light: "rgba(254, 254, 254, 0.78)", dark: "rgba(37, 37, 40, 0.38)" },

  /** The opaque control surface. The rail's counts land here, not on the card. */
  glassSolid: { light: "rgba(255, 255, 255, 0.9)", dark: "rgb(37, 37, 39)" },

  /**
   * The accent, for fills: a selected pill, a progress bar, a focus ring.
   *
   * iOS system blue, deliberately the same in both themes — it is the one
   * colour that should not shift when the lights go out, because it is the only
   * one carrying "this is the thing you chose".
   *
   * A graphic wants 3:1 and this clears it. It is **not** a text colour; see
   * below.
   */
  tint: { light: "#007aff", dark: "#007aff" },

  /**
   * The accent as text: links, an active label.
   *
   * Split off from the fill because the fill fails AA as text and nothing in
   * the codebase said so. #007aff measures 4.02:1 on white and 3.87:1 on the
   * page — fine for a shape, not for a word. This is the darkened value that
   * clears 4.5 on both, and in dark mode the system blue is already past the
   * floor so it stays.
   */
  tintLabel: { light: "#0066cc", dark: "#007aff" },

  /**
   * Warning / destructive: the delete-account panel border and button — the
   * only place in the app that uses a warning colour. Used to be a literal
   * `#d7263d` written directly in app/styles/settings.css, with a comment
   * arguing it belonged there rather than as a token "nothing else would
   * use". Moved here once that literal moved into a .tsx file and
   * sources.test.ts stopped allowing a hex outside this file — the argument
   * for keeping it un-tokenised was about discoverability, not about the
   * value being safe to duplicate.
   *
   * Same value in both themes, deliberately: like tint, a colour that means
   * "this is destructive" should not soften when the lights go out.
   */
  danger: { light: "#d7263d", dark: "#d7263d" },
} satisfies Record<string, ColourPair>;

/**
 * What the tiers are actually read against, per theme.
 *
 * Named rather than inlined into the test because these three are the whole
 * point: every contrast failure this project has recorded was found on a
 * surface, not on a flat hex, and forgetting one is how the next one gets
 * missed.
 */
/**
 * Corner radius scale.
 *
 * Moved here from tokens.css once the Tailwind migration needed to generate
 * `rounded-*` utilities from these values — colour crossed the same line
 * first, for the same reason (see the file header). Two control shapes worth
 * reading carefully: `btn` is the pill, a 40px control with fully round ends,
 * what every labelled button on the site wears. `pill` is not a pill despite
 * the name, it is the rounded rectangle: the glass hover-pill on rows, and the
 * filter-bar controls on /cards, where a round end beside a search field reads
 * as loose. The name stays because thirty rules answer to it.
 */
export const radius = {
  xs: "6px",
  sm: "8px", // buttons, covers
  md: "16px", // small cards, photos
  lg: "24px", // bento cards / panels
  btn: "999px",
  pill: "14px", // glass hover-pill (connect rows, tab pills, FAQ)
} satisfies Record<string, string>;

/**
 * ── The rest of the scales ─────────────────────────────────────────────────
 *
 * Colour and radius crossed into this file first, each for its own reason (see
 * the headers above). The rest followed for a third one, and it is worth being
 * precise about it because "move the tokens to TypeScript" is not by itself an
 * improvement.
 *
 * Only what reaches `@theme` becomes a Tailwind utility. Colour and radius did,
 * so a component writes `text-label` and `rounded-btn`. Everything else was
 * declared in tokens.css as an ordinary custom property, which Tailwind cannot
 * see, so the only way to reach it from a className was the arbitrary-value
 * escape hatch — `[font-size:var(--fs-small)]`, `[font-weight:var(--fw-title)]`,
 * `[transition-timing-function:var(--ease-smooth)]`.
 *
 * Measured before this change: **721** `var(--…)` references inside `.tsx`, the
 * top five being `--fs-small` (77), `--font-body` (70), `--font-main` (49),
 * `--fw-title` (34) and `--dur-fast` (22). That is not a styling choice, it is
 * a system that stops at the door of the language every component is written
 * in.
 *
 * ── What is here and what deliberately is not ──────────────────────────────
 *
 * Here: the scales that are one value regardless of theme or viewport — type,
 * weight, line-height, family, easing, duration, blur, stacking order.
 *
 * Not here, and each for a reason rather than for lack of time:
 *
 * - **The shadows.** Light draws three layers and dark draws two, so the pair
 *   is a different *shape* and not a different value; `light-dark()` is a
 *   colour function and cannot express it. They stay in tokens.css beside their
 *   dark-mode block, and the generator gives each an `@utility` that reads the
 *   variable — one class, correct in both themes.
 * - **The layout constants** (`--page-pad-x`, `--card-pad`, `--main-pad-top`,
 *   `--control-h`, `--content-max`). Every one of them is redefined at a
 *   breakpoint. Same treatment: the value stays in CSS where the media queries
 *   are, the generator gives it a utility.
 * - **The spacing scale.** `--space-1` through `--space-12` are 4, 8, 12, 16,
 *   20, 24, 28, 32, 40, 48 with half-steps at 10 and 14 — which is exactly
 *   Tailwind's default scale, step for step. `p-4` already *is* `--space-4`.
 *   Promoting it would generate a second name for utilities that exist, so the
 *   scale stays in CSS for the hand-written sheets and a className says `p-4`.
 * - **`--fs-label`.** The one omission that is a collision rather than a
 *   principle: it would have to be `--text-label`, and `--color-label` already
 *   owns the `text-label` class. Tailwind would resolve one of the two and say
 *   nothing, which is how a colour used in forty places silently becomes a font
 *   size. Nothing in this app reads `--fs-label` any more, so it stays in
 *   tokens.css unpromoted rather than being renamed into the scale.
 */

/**
 * Type sizes. Every step is a clamp between what it is on a phone and what it
 * is on a desktop, reaching its floor at 640px and its ceiling at 900px.
 *
 * The floors matter as much as the ceilings, and they are not the ceiling minus
 * one rung: a floor is chosen against its *neighbours*. They used to be chosen
 * against their own ceiling, and the result was that a page heading came out
 * barely larger than the card titles under it at 320px. `tokens.test.ts` holds
 * the ordering to it — anything larger than another step here has to still be
 * larger at 640px.
 */
export const text = {
  /** A page's own title. It should still be the biggest thing on a phone. */
  display: "clamp(34px, 3.08vw + 12.3px, 40px)",
  /** Section heads. */
  h2: "clamp(26px, 1.54vw + 14.2px, 28px)",
  /** Card and panel titles. */
  card: "clamp(20px, 1.54vw + 10.2px, 24px)",
  /** Sub-heads. 17 on a phone, not 16: `bodyL` floors at 16 and a sub-head the
   *  same size as the lede under it is not a sub-head. */
  sub: "clamp(17px, 1.15vw + 9.6px, 20px)",
  body: "clamp(14px, 0.38vw + 11.5px, 15px)",
  bodyS: "clamp(14px, 0.38vw + 11.5px, 15px)",
  /** Off-scale on purpose, and only for long-form: a lede, a standfirst. The
   *  next step up is `sub` at 20px, which reads as a heading inside prose. */
  bodyL: "clamp(16px, 0.38vw + 13.5px, 17px)",
  small: "clamp(12px, 0.38vw + 9.5px, 13px)",
  eyebrow: "clamp(12px, 0.38vw + 9.5px, 13px)",
  /**
   * Every control, field and label alike.
   *
   * `max()` rather than a step, and the argument is a real bug: Safari on iOS
   * zooms the page into any field whose text is under 16px the moment it takes
   * focus, and leaves you there. `bodyS` is 15px on desktop and 14px on mobile,
   * so a field wearing the step alone lurches to full screen as soon as you
   * type. This never goes below 16.
   */
  control: "max(16px, var(--text-body-s))",
  /**
   * A control's *label*, beside the text in the field next to it.
   *
   * Two pixels under, because the two have to look equal rather than measure
   * equal. Fields keep `control` and never go under 16, so nothing anybody
   * types moves with this.
   */
  controlLabel: "calc(var(--text-control) - 2px)",
  /**
   * One step under `small`, for numerals inside a fixed shape: the count badges
   * on the rail, the dense scan tags. It does not step down on mobile like the
   * rest — the badges are digits centred in an 18px circle that keeps its size,
   * so shrinking the type would only move the digit off the edge it is balanced
   * against.
   */
  tiny: "11px",
} satisfies Record<string, string>;

/** Line heights. */
export const leading = {
  tight: "1.2",
  snug: "1.35",
  normal: "1.5",
  relaxed: "1.7",
} satisfies Record<string, string>;

/**
 * Weights, named by role rather than by number, because the role is the thing
 * that stays true when the typeface changes and 500 is not.
 */
export const fontWeight = {
  regular: "400",
  title: "500",
  eyebrow: "600",
  button: "700",
} satisfies Record<string, string>;

/**
 * Families. Custom first, then system fallbacks, so content renders immediately
 * while the web font is still loading. Inter is loaded via `next/font/local` in
 * layout.tsx, which is what sets `--font-inter`.
 *
 * No web font is loaded for `mono` on purpose: it appears a handful of times —
 * an error digest, a token name — and none of them is worth a download.
 */
export const font = {
  main: 'var(--font-inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
  body: 'var(--font-inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} satisfies Record<string, string>;

/**
 * House easing. The bare `ease` is banned, and so is Tailwind's default set —
 * `out` and `inOut` deliberately take the same names as Tailwind's own so that
 * `ease-out` in a className is this project's curve rather than a generic one.
 * A design system that only applies when somebody remembers the prefix is a
 * suggestion.
 */
export const ease = {
  /** Default for almost everything. */
  smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Entrances and reveals that decelerate. */
  out: "cubic-bezier(0.17, 1, 0.32, 1)",
  /** Pops: dots, a label catching up, a press releasing. */
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Symmetric A↔B: the theme knob, the tab pill. */
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} satisfies Record<string, string>;

/**
 * Durations. Three steps for interface response, where the ceiling is about
 * 300ms and a control that takes longer than that to answer feels slow.
 *
 * Reach for `slow` only when something is *travelling* — covering a distance
 * rather than changing a state — never to make an ordinary transition more
 * relaxed.
 */
export const duration = {
  fast: "150ms",
  normal: "200ms",
  slow: "280ms",
} satisfies Record<string, string>;

/**
 * Glass blur, three tiers, because the surfaces genuinely differ: bars and
 * toggles sit directly over content, cards over more of it, and pills are small
 * enough that a heavy blur reads as mud.
 *
 * The two scrims are a different job. A glass tier is how much a pane frosts
 * what is behind it; a scrim is how much a fade softens whatever passes under
 * it, which is much lighter because there is no surface to sell.
 */
export const blur = {
  /** Bars, toggles, overlays. */
  glass: "20px",
  /** Bento and panel card surfaces. */
  glassCard: "24px",
  /** Hover pills and tab indicators. */
  glassPill: "16px",
  /** Card and page scrims: the modal dim, a page fade. */
  scrim: "10px",
  /** Small chrome over content: a tooltip, the tab bar's fade. */
  scrimSm: "8px",
} satisfies Record<string, string>;

/**
 * Stacking order, page level only, and that is the whole distinction.
 *
 * A z-index of 0, 1, 2 or -1 inside a component — text over its own `::before`,
 * a canvas under its label — is local stacking. It means "above the thing next
 * to me", it never competes with anything on this list, and it stays a literal.
 * There are around fifty of those and tokenising them would claim they are all
 * part of one order when they are not.
 *
 * If a value decides what covers what *across the page*, it belongs here. If it
 * decides what covers what inside one box, it does not.
 */
export const zIndex = {
  /** Floating bars that scroll with the page. */
  sticky: "200",
  /** Tab navigation background. */
  tabbar: "899",
  /** Tab page stack. */
  tabpage: "900",
  /** Floating controls: the theme toggle. */
  controls: "950",
  /** Modal backdrops. */
  modal: "1000",
  /** Sheets that layer above modals. */
  sheet: "1010",
  /** The skip-to-content link, which has to beat everything. */
  skip: "9999",
} satisfies Record<string, string>;

/**
 * The values that stay in tokens.css and get a utility anyway.
 *
 * Two groups, both listed here rather than in the generator, because the
 * generator should not be the place that knows which parts of the design system
 * exist. Each entry is the CSS property a class of this name should set, and
 * the variable it should read.
 *
 * The shadows are theme-shaped (three layers in light, two in dark) and the
 * layout constants are breakpoint-shaped. Both kinds have to keep their
 * declaration next to the `@media`/`[data-theme]` block that answers for them,
 * which is CSS. What they do not have to keep is being unreachable from a
 * className.
 */
export const utilities = {
  "shadow-card": { property: "box-shadow", variable: "--shadow-card" },
  "shadow-elevated": { property: "box-shadow", variable: "--shadow-elevated" },
  "shadow-image": { property: "box-shadow", variable: "--shadow-image" },
  "h-control": { property: "height", variable: "--control-h" },
  "min-h-control": { property: "min-height", variable: "--control-h" },
  "max-w-content": { property: "max-width", variable: "--content-max" },
  "p-card": { property: "padding", variable: "--card-pad" },
  "px-page": { property: "padding-inline", variable: "--page-pad-x" },
  "pb-page": { property: "padding-bottom", variable: "--page-pad-bottom" },
  "pt-main": { property: "padding-top", variable: "--main-pad-top" },
  "h-tabbar-pill": { property: "height", variable: "--tabbar-pill-h" },
} satisfies Record<string, { property: string; variable: string }>;

export const surfaces = {
  light: {
    page: colour.bgGrouped.light,
    card: colour.bgSurface.light,
    glass: { over: colour.bgGrouped.light, colour: colour.glass.light },
    control: { over: colour.bgGrouped.light, colour: colour.glassSolid.light },
  },
  dark: {
    page: colour.bgGrouped.dark,
    card: colour.bgSurface.dark,
    glass: { over: colour.bgGrouped.dark, colour: colour.glass.dark },
    control: { over: colour.bgGrouped.dark, colour: colour.glassSolid.dark },
  },
} as const;
