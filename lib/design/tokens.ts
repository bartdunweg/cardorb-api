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
 * Untitled UI's brand ramp, in Card Orb's blue.
 *
 * Untitled UI's semantic layer never names a colour directly — every one of its
 * ~120 semantic variables points at a primitive, and 65 of them point into this
 * eleven-step ramp. So the whole library takes this app's accent by replacing
 * eleven values, which is the cheap half of ADR-0054 and why the semantic layer
 * is left alone.
 *
 * ADR-0055 decides what may differ from Untitled UI at all: its value is the
 * default, and ours needs either to be the identity or to be argued from a
 * measurement. This ramp is both, and the two anchors are the measured half.
 *
 * ── How the eleven values were reached ─────────────────────────────────────
 *
 * Not by eye. Untitled UI's own ramp is a purple whose eleven steps have a
 * deliberate lightness curve; that curve is design work worth keeping. So each
 * step keeps Untitled UI's OKLCH *lightness*, takes the tint's *hue*, and has
 * its chroma scaled by the tint's chroma over Untitled UI's at step 600. The
 * derivation is in the commit message and reproducible from those two ramps.
 *
 * Three steps then override that derivation, because the derived value would be
 * unmeasured and these three are load-bearing:
 *
 *   500 — `--color-border-brand`, which is the focus ring. `tint` below is
 *         argued as exactly this ("a selected pill, a progress bar, a focus
 *         ring") and measured past the 3:1 a graphic needs.
 *   600 — `--color-bg-brand-solid`, the filled accent. Same value, same
 *         argument. 500 and 600 being equal is not a slip: this app has one
 *         accent, not a ramp of them.
 *   700 — `--color-text-brand-secondary`, the accent *as a word*. `tintLabel`
 *         exists because the fill fails AA as text — 4.02:1 on white, 3.87:1
 *         on the page — so this is the darkened value that clears 4.5 on both.
 *
 * The eight remaining steps are backgrounds and subtle borders. They are
 * derived, not measured, and any of them that ends up under text has to be
 * measured on the glass before it is trusted — which is the failure
 * gen-tokens.mjs's header already records happening once.
 */
export const brand = {
  50: "#f1f8ff",
  100: "#e2f1ff",
  200: "#c6e2ff",
  300: "#9eccff",
  400: "#61a8ff",
  500: colour.tint.light, // focus ring — measured ≥3:1 as a graphic
  600: colour.tint.light, // filled accent — the same one accent
  700: colour.tintLabel.light, // accent as text — measured ≥4.5:1
  800: "#0048af",
  900: "#003c8a",
  950: "#002669",
} satisfies Record<string, string>;

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
