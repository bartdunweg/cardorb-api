/**
 * Tailwind classes for the floating tab bar, shared between CardsTabBar.tsx
 * and (app)/loading.tsx (which draws the same bar as a skeleton). Used to be
 * app/styles/tabbar.css + app/styles/layout.css.
 *
 * "tabbar-pages", "tabbar-item", "is-active" and "tabbar-label" stay as
 * literal class names alongside the Tailwind utilities below: cards.css (not
 * yet migrated) reaches them by name from `.cards-tabbar .tabbar-pages` etc.,
 * and useSlidingPill.ts queries ".tabbar-item.is-active" directly. Remove
 * them only once cards.css's own migration rewrites those selectors.
 *
 * Exact `[@media(...)]:` arbitrary variants rather than Tailwind's sm/max-sm
 * throughout: the original split mobile at max-width:640px and desktop at
 * min-width:641px so the two never both match at once, and Tailwind's
 * max-sm (<640px) / sm (>=640px) would show desktop styling at exactly
 * 640px instead of mobile.
 *
 * No >=641px "move to the top" override here, unlike the original tabbar.css:
 * that generic desktop behaviour was written for a site-wide nav bar this
 * app never renders bare. Every consumer is CardsTabBar.tsx, always combined
 * with "cards-tabbar"/"cards-tabbar-fade" (still legacy-CSS, not yet
 * migrated), whose 641-1000px rules put it back at the bottom.
 *
 * Its >=1001px rule does NOT hide the bar, though — a previous version of
 * this comment claimed it did, and that was wrong: `@layer theme, base,
 * legacy, components, utilities;` (globals.css) puts `legacy` before
 * `utilities`, so `.cards-tabbar`'s `display: none` there can never beat
 * this file's unconditional `flex` below, at any width, media query or not
 * — a later layer always wins over an earlier one once both rules match,
 * regardless of which is more specific to the viewport. The bar stayed
 * visible above 1000px, next to the rail, until this was found by hand. The
 * `[@media(min-width:1001px)]:!hidden` below fixes it in this file instead
 * of cards.css, so the override lives in the same (winning) `utilities`
 * layer as the `flex` it has to beat; `!` forces `!important` rather than
 * trusting generation order between two differently-named utilities (`flex`
 * vs `hidden`) on an arbitrary, non-Tailwind-scale breakpoint, which is not
 * a documented guarantee the way ascending sm:/md:/lg: order is.
 */

export const tabbarFadeClassName =
  "fixed w-[var(--lock-vw,100%)] left-0 right-0 bottom-0 h-36 z-[var(--z-tabbar)] pointer-events-none " +
  "[background:linear-gradient(to_top,var(--color-bg-grouped)_20%,color-mix(in_srgb,var(--color-bg-grouped)_80%,transparent)_50%,color-mix(in_srgb,var(--color-bg-grouped)_0%,transparent)_100%)] " +
  "[mask-image:linear-gradient(to_top,#000_60%,transparent_100%)] [backdrop-filter:blur(var(--blur-scrim-sm))]";

/**
 * No toggle-footprint reservation on this route's own side padding below
 * 640px, unlike the original tabbar.css/layout.css: cards.css already said
 * so ("Both undo layout.css, which reserves the theme toggle's footprint on
 * either side of the bar... There is no toggle on this route to reserve for")
 * and tried to cancel it there, but that cancellation lives in the `legacy`
 * layer and can never beat this file's own `utilities`-layer padding once
 * both match — the same cascade-layer fact `ADR-0012`/`0017`/`0028` already
 * found three times over (see this file's own header comment for the
 * `[@media(min-width:1001px)]:!hidden` fix built the same way). Baked the
 * correct value in here instead of trusting cards.css to win a fight it
 * structurally cannot: plain `var(--space-4)` on every side, not
 * `space-3 + control-h + space-3` reserved for a control this route never
 * has. That reservation (roughly 130px on top of the actual content) was
 * squeezing the track's available width far below what four labelled slots
 * plus the add circle need, which is what min-w-max below then had to force
 * back out past — sometimes past the viewport itself, since the missing
 * width was never really about the content.
 */
export const tabbarClassName =
  "fixed w-[var(--lock-vw,100%)] left-0 right-0 bottom-0 z-[var(--z-tabpage)] [transform:translateZ(0)] " +
  "flex items-center justify-center gap-4 " +
  "[padding:var(--space-6)_var(--space-4)_calc(var(--space-6)+env(safe-area-inset-bottom,0px))] " +
  "pointer-events-none [&>*]:pointer-events-auto " +
  "[@media(max-width:640px)]:gap-2 " +
  "[@media(max-width:640px)]:[padding:var(--space-4)_var(--space-4)_calc(var(--space-4)+env(safe-area-inset-bottom,0px))_var(--space-4)] " +
  "[@media(min-width:1001px)]:!hidden";

/**
 * min-w-max, kept as a safety net now that the cap below is sized to the
 * route's real content instead of a phantom toggle reservation — without it,
 * a device where the 72px-per-slot estimate (tabbarItemClassName) still
 * undershoots would silently go back to squeezing the track below its
 * content, the exact symptom this whole fix chased. A conflicting min-width
 * always wins over max-width by spec, so this can only ever widen the track
 * past the cap, never let the cap shrink it below its slots.
 *
 * The cap itself: `calc(100vw - 2*var(--space-4))`, matching the plain
 * `var(--space-4)` side padding tabbarClassName now reserves above — not the
 * old `space-3 + control-h + space-3` formula, which reserved room for a
 * theme toggle this route never renders (see tabbarClassName's own comment).
 * That phantom reservation was the actual cause of the pill/edge-inset bug
 * this file already fixed once with min-w-max alone: forcing the track past
 * an artificially small cap could put it past the viewport's own width too,
 * which reads as "no space at the edges" from the other direction — the
 * capsule overflowing off-screen symmetrically rather than being squeezed
 * inside it.
 */
/**
 * One value — p-2, and gap-2 to match — for every gap this track has:
 * between the capsule's own edge and the leftmost/rightmost slot, between
 * each item and the add circle, and (via p-2's vertical half) above/below
 * every item. On explicit instruction: not a bigger horizontal number than
 * vertical (the previous pass's px-3/py-2, guessing the rounded corner ate
 * into a smaller horizontal inset) and not a smaller inter-item gap than the
 * edges (gap-1) — one number, applied everywhere a gap exists here, so nine
 * seemingly-independent spacing bugs can't reopen this file nine more times.
 */
export const tabbarPagesClassName =
  "tabbar-pages relative flex items-center justify-center gap-2 w-auto min-w-max p-2 " +
  "bg-[var(--glass-bg-solid)] border border-[var(--glass-border)] rounded-btn " +
  "[box-shadow:var(--shadow-elevated)] [backdrop-filter:blur(var(--blur-glass))] " +
  "[@media(max-width:640px)]:max-w-[calc(100vw-2*var(--space-4))]";

/**
 * Classic bottom-tab shape now: icon over a label, both always shown, on
 * every slot rather than only the active one. Was icon-only with the label
 * collapsed to nothing and faded in on .is-active alone ("five icons and no
 * words is a bar you learn rather than read" — the old comment's own
 * argument for it), changed on explicit instruction. flex-col replaces the
 * old row layout; the active-only width expansion this needed (the label
 * used to grow the slot when it appeared) is gone since every slot is
 * already sized for its label now, active or not.
 *
 * Include the literal "is-active" class alongside this when the tab is
 * selected.
 *
 * w-[var(--tab-w,104px)], not min-w: every slot the same width regardless of
 * its own label ("Dashboard" vs "You"), so the pill sliding between them
 * changes position without also changing size.
 *
 * --tab-w is set on the track (CardsTabBar.tsx, .tabbar-pages) from the
 * actually-measured widest label, not guessed — a first pass hard-coded
 * 72px from an estimate at --fs-tiny (11px), and "Dashboard" still clipped
 * to "Dashbo…" on a real phone, twice, including once *after* the
 * measurement effect landed (never fully root-caused which part of that
 * chain — font load timing, a Turbopack HMR staleness, something else —
 * failed on the device it was tested on; see CardsTabBar.tsx's own comment
 * on the effect for what it now does to be harder to get wrong). So the
 * *fallback* itself — the CSS var's default, used before that effect can
 * run and however it behaves once it does — stopped being a tight estimate
 * and became a deliberately generous 104px instead: comfortably past even a
 * pessimistic reading of what "Dashboard" needs, so the visible symptom
 * (clipping) can't recur even if the measurement never fires correctly on
 * some device. `min-w-[56px]` beneath it exists for the same reason
 * `tabbarLabelClassName` still carries `truncate`: a safety floor under a
 * safety net, not the primary mechanism either way.
 */
export const tabbarItemClassName =
  "tabbar-item group relative z-[1] flex flex-col items-center justify-center gap-0.5 flex-none " +
  "w-[var(--tab-w,104px)] min-w-[56px] " +
  "px-2 py-1.5 border border-transparent rounded-btn bg-transparent cursor-pointer text-label no-underline " +
  "[transition:color_var(--dur-fast)_var(--ease-in-out)] [&:not(.is-active):hover]:opacity-70";

export const tabbarIconClassName = "flex shrink-0";

/** Always visible now, under the icon — no longer collapsed for anything but
 *  the active tab. Requires the ancestor .tabbar-item to also carry
 *  Tailwind's `group` class (tabbarItemClassName does), kept even though
 *  nothing here reads `group-[...]` any more: CardsTabBar.tsx's `item()`
 *  still applies "group" unconditionally and there is no reason to make
 *  that conditional for one class that stopped needing it. */
/** max-w-full + truncate, now that the slot is a fixed w-16 rather than
 *  sized to fit whichever label is longest — "Dashboard" would otherwise
 *  overflow a slot sized for "You". */
export const tabbarLabelClassName =
  "tabbar-label max-w-full truncate [font-size:var(--fs-tiny)] leading-none";

/** The same glass-lift surface the sidebar's rows use for hover/active
 *  (.cards-nav-item::after, components.css) — was solid black
 *  (bg-[var(--btn-primary-bg)]), changed on explicit instruction so the
 *  sidebar and the tabbar read as the same visual language rather than the
 *  sidebar's rows lifting onto glass and the active tab sitting on a filled
 *  black pill. Include "is-ready"/"is-animated" alongside this as the
 *  pill's placement settles. */
export const tabbarPillClassName =
  "tabbar-pill absolute left-0 top-0 z-0 rounded-btn bg-[var(--glass-bg)] " +
  "border border-[var(--glass-border)] [backdrop-filter:blur(var(--blur-glass-pill))] " +
  "[box-shadow:var(--shadow-card)] opacity-0 pointer-events-none " +
  "[&.is-ready]:opacity-100 " +
  "[&.is-animated]:[transition:transform_0.38s_var(--ease-smooth),width_0.38s_var(--ease-smooth),height_0.38s_var(--ease-smooth)]";
