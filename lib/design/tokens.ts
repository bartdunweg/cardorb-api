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
   * The page. Painted on body, and what the browser chrome is tinted from.
   *
   * These are Untitled UI's `bg-secondary` written out in hex — neutral-50 and
   * neutral-900 — because a <meta name="theme-color"> and a web manifest are
   * not CSS and cannot read a variable. That is also why they have to be kept
   * in step by hand: if the page's class changes, this changes.
   *
   * It said #ffffff / #181818 up to here, which was true when ADR-0024 made the
   * light page white, and stopped being true when the Untitled UI adoption put
   * html and body on `bg-secondary`. The gap was not cosmetic: Safari paints
   * the rubber-band bands above and below the page from theme-color, so every
   * screen had a seam at the top and bottom that the comment on
   * `viewport.themeColor` had already warned about.
   */
  bgGrouped: { light: "#fafafa", dark: "#171717" },

  /**
   * A card, and everything else that stands above the page — the navbar, the
   * rail, the tab-bar capsule. Untitled UI's `bg-primary`: white and
   * neutral-950.
   *
   * Raised by colour in both themes now. ADR-0024 had flattened light to a
   * white page and a white card, leaving cards to read by border and shadow
   * alone; adopting Untitled UI's ramp gave light its step back, and dark keeps
   * the card darker than the page it lies on.
   */
  bgSurface: { light: "#ffffff", dark: "#0a0a0a" },

  /**
   * The opaque control surface, and the last of the glass.
   *
   * One consumer left: Modal.tsx's `bg-glass-solid`. Its translucent sibling
   * `glass` — the card fill — went with ADR-0090, along with the accent pair and
   * the logo tier; the measurements that argued them are in that record.
   */
  glassSolid: { light: "rgba(255, 255, 255, 0.9)", dark: "rgb(37, 37, 39)" },
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
 *
 * ── Why four of these are called orb* ──────────────────────────────────────
 *
 * They were `xs`/`sm`/`md`/`lg`, which are Tailwind's own names, and @theme
 * does not add to Tailwind's scale — it replaces it. So `rounded-lg` meant
 * 24px everywhere, including inside components this project did not write.
 *
 * That went unnoticed until Untitled UI arrived and the proof screen came back
 * with pill-shaped inputs: every `rounded-lg` in a vendored component was
 * quietly resolving to `var(--radius-lg)` — 24px, three times what upstream
 * drew, and nothing failed. A silent collision through a shared name, which is
 * the same shape as ADR-0012 and ADR-0017.
 *
 * ADR-0056 settles which way it goes: Untitled UI's value is the default, so
 * `rounded-lg` goes back to meaning Tailwind's 8px and Card Orb's scale moves
 * out of the way. `rounded-orb-lg` is unmistakably ours and cannot collide with
 * anything upstream adds later.
 *
 * `btn` and `pill` keep their names — they are not Tailwind's, so they never
 * collided.
 */
export const radius = {
  orbXs: "6px",
  orbSm: "8px", // buttons in their rectangle shape, covers
  orbMd: "16px", // small cards, photos
  orbLg: "24px", // bento cards / panels
  btn: "999px", // buttons in their round shape — see `control` below
  pill: "14px", // glass hover-pill (connect rows, tab pills, FAQ)

  /**
   * ── The shape of a control, as a variable rather than a value ─────────────
   *
   * The five entries above are values. This one is a *pointer*, and it is the
   * only token in this file that is meant to be reassigned while the page is
   * running.
   *
   * Card Orb draws controls in two shapes. Round — a capsule, `btn` — is the
   * default and what every button wears unless something says otherwise.
   * Rectangle — `orbSm`, 8px — is the opt-in, and it is exactly what every
   * button wore before this token existed.
   *
   * Both shapes had to be reachable without each control learning about shape.
   * The alternative was a `shape` prop threaded down into the class strings of
   * `button.tsx`, `button-group.tsx`, `input.tsx`, `input-group.tsx` and
   * `untitledButtonClasses.ts` — five files that would each have to be edited
   * again for a sixth control, and none of which could then be made rectangular
   * as a *block* without touching every call site inside it.
   *
   * A custom property is the mechanism the platform already has for this. The
   * two `@utility` blocks the generator writes — `shape-round` and
   * `shape-rectangle` — reassign it, so:
   *
   *   - `<Button shape="rectangle">` is one class on one element.
   *   - `<div className="shape-rectangle">` is a whole form, toolbar or dialog
   *     footer, and the controls inside it need to know nothing.
   *   - `shape-round` *inside* a rectangle block wins, because that is what the
   *     cascade does. A descendant-selector variant could not undo itself.
   *
   * A warning worth carrying, because the name has a history. ADR-0054 records
   * `/brand` drawing its colour swatches with `rounded-[var(--radius-control)]`
   * when no such token had ever existed: the declaration was dropped, the
   * corners came out square, and nothing failed until `vars.test.ts` was pointed
   * at `.tsx`. **The guard did not regress — the token is real now.** That page
   * still says `rounded-pill`, and deliberately: it is documenting a fixed
   * shape, not wearing whatever shape a control happens to be in.
   */
  control: "var(--radius-btn)",

  /**
   * The button's inner border sits 1px inside the edge (`before:inset-px`), so
   * its radius has to be 1px tighter or the two curves fight. This was written
   * as the literal `rounded-[7px]` against `rounded-lg`'s 8 — correct, and only
   * correct for one shape. Derived from the shape now, so it cannot be left
   * behind when the shape changes. At 999px it resolves to 998px, which is
   * still a capsule.
   */
  controlInner: "calc(var(--radius-control) - 1px)",
} satisfies Record<string, string>;

/**
 * ── How much room a control's text needs at its ends ──────────────────────────
 *
 * Side padding is the second thing shape changes, and the reason is optical
 * rather than arithmetic: a capsule's corner curves away from the text for the
 * full height of the control, so a word set at a rectangle's padding reads as
 * touching the edge even though it measures the same gap.
 *
 * So there are two sets. `controlPx` is the round one and the default; a size's
 * value is its rectangle value plus 4px. `controlPxRect` is what every button
 * measured before this existed, and `shape-rectangle` restores it — which is
 * what makes the rectangle shape a true "what it used to be" rather than a
 * near miss.
 *
 * One variable per size rather than one shared `+4px` bonus, so a size that
 * looks wrong on screen can be tuned on its own. The 4px is a starting point,
 * not a rule the scale has to keep.
 *
 * Only `controlPx` is emitted as a token. The rectangle values are read
 * straight into the `shape-rectangle` block by the generator, because a
 * `--control-px-rect-md` that nothing may reference from a className would be a
 * name inviting exactly the misuse it cannot serve.
 */
export const controlPx = {
  xs: "14px",
  sm: "16px",
  md: "18px",
  lg: "20px",
  xl: "22px",
} satisfies Record<string, string>;

/** The same five, as they were before the round shape became the default. */
export const controlPxRect = {
  xs: "10px",
  sm: "12px",
  md: "14px",
  lg: "16px",
  xl: "18px",
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
 * - **`--fs-label`.** Not omitted — *gone*, and the distinction matters because
 *   this bullet claimed for months that it "stays in tokens.css unpromoted".
 *   tokens.css does not exist and the variable is declared nowhere; the one
 *   thing that wanted it, the wordmark, writes its clamp literally.
 *
 *   The reason it was never promoted is worth keeping even though the value is
 *   not: it would have to be `--text-label`, and `--color-label` already owns
 *   the `text-label` class. Tailwind resolves one of the two and says nothing,
 *   which is how a colour used in forty places silently becomes a font size —
 *   the same shape as ADR-0012 and the `rounded-lg` collision above. Check for
 *   it before promoting any step into `@theme`.
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
  /* `body` and `mono` were here and are Untitled UI's now.
   *
   * They are the only two names in this file that collide with its theme — 59
   * Card Orb tokens against 306 of theirs, and these two — and the generator
   * emits ours after theirs, so ours were winning. ADR-0063 settles which way
   * that goes: theirs.
   *
   * No visible change either way. Both are Inter with a system fallback list;
   * only the tail of the list differs. That is exactly why it is worth removing
   * rather than leaving: two definitions of one font, agreeing today, with
   * nothing to keep them agreeing tomorrow.
   *
   * `main` stays because it has no Untitled UI counterpart and cards.css reads
   * `var(--font-main)` by name. */
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

/* `utilities` used to be here — a map generating @utility classes for
   shadow-card, h-control, p-card, px-page and seven more. Every one of them had
   zero call sites: the components reach the variables directly, or have moved to
   Untitled UI's own utilities. Removed with the three --shadow-* tokens that
   existed only to feed it. */

/**
 * The surfaces a text tier is actually read against, per theme.
 *
 * Three, not four: `glass` — the translucent card fill — left with ADR-0090,
 * because no component had rendered it since ADR-0061 removed glass, and a tier
 * measured against a surface nothing draws is a measurement of nothing. What is
 * left is a surface each: the page, a card, and the one control still made of
 * glass (Modal.tsx).
 */
export const surfaces = {
  light: {
    page: colour.bgGrouped.light,
    card: colour.bgSurface.light,
    control: { over: colour.bgGrouped.light, colour: colour.glassSolid.light },
  },
  dark: {
    page: colour.bgGrouped.dark,
    card: colour.bgSurface.dark,
    control: { over: colour.bgGrouped.dark, colour: colour.glassSolid.dark },
  },
} as const;
