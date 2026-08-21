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
  "[mask-image:linear-gradient(to_top,#000_60%,transparent_100%)] [backdrop-filter:blur(var(--blur-scrim-sm))] " +
  // The rail is back beside the cards above 1000px, so the bar and its scrim
  // have nothing left to do. `!` for the same reason the bar's own hide has it:
  // `fixed` above is unconditional and this is not, and the order Tailwind
  // emits two display-ish utilities in is not a promise (ADR-0012).
  "[@media(min-width:1001px)]:!hidden";

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
 * structurally cannot: plain `calc(var(--spacing)*4)` on every side, not
 * `space-3 + control-h + space-3` reserved for a control this route never
 * has. That reservation (roughly 130px on top of the actual content) was
 * squeezing the track's available width far below what four labelled slots
 * plus the add circle need, which is what the track's since-removed
 * min-w-max then had to force back out past — sometimes past the viewport
 * itself, since the missing width was never really about the content.
 *
 * This padding is the whole outer margin now: the track below shrinks to fit
 * rather than insisting on its content's width, so what it is given is what
 * it takes (ADR-0050).
 */
export const tabbarClassName =
  "fixed w-[var(--lock-vw,100%)] left-0 right-0 bottom-0 z-[var(--z-tabpage)] transform-gpu " +
  "flex items-center justify-center gap-4 " +
  "px-4 pt-6 [padding-bottom:calc(var(--spacing)*6+env(safe-area-inset-bottom,0px))] " +
  "pointer-events-none [&>*]:pointer-events-auto " +
  "[@media(max-width:640px)]:gap-2 " +
  "[@media(max-width:640px)]:px-4 [@media(max-width:640px)]:pt-4 " +
  "[@media(max-width:640px)]:[padding-bottom:calc(var(--spacing)*4+env(safe-area-inset-bottom,0px))] " +
  "[@media(min-width:1001px)]:!hidden";

/**
 * min-w-0, where this used to say min-w-max and a `<=640px` max-w cap. Both
 * are gone, and the reason is ADR-0050: the pill was drawn *outside* the
 * capsule's left and right edges, not short of a margin inside them.
 *
 * min-w-max was meant to widen the capsule to whatever its slots need, so the
 * row could never overflow. It under-reserved by exactly the add circle's
 * 40px: `width: min(var(--control-h), 100%)` (as .cards-tabbar-add was) makes
 * a percentage the browser cannot resolve while computing an intrinsic size,
 * so the circle counted as roughly zero towards max-content. Measured: the
 * track's min-width resolved to 352.586px where its content needed 390.
 * Giving the circle a plain width fixed *that*, and immediately produced the
 * other half of the same bug — a capsule now correctly 382px wide on a 360px
 * phone, hanging 11px off both edges of the screen instead.
 *
 * So neither knob was ever the answer: a track that is allowed to be wider
 * than the bar has room for will overflow somewhere, and with justify-center
 * it overflows symmetrically out of both ends. min-w-0 lets it shrink, the
 * slots below shrink with it (flex-initial min-w-0), and the <nav>'s own
 * calc(var(--spacing)*4) side padding is then the only thing deciding the outer
 * margin — which is what it looked like it was doing all along.
 *
 * No max-w either: w-auto hugs the content, and the nav's padding caps it.
 * The old `calc(100vw - 2*calc(var(--spacing)*4))` said the same thing in a second
 * place, in viewport units that quietly include a scrollbar between 641 and
 * 1000px where this bar is still shown.
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
 *
 * Untouched by ADR-0050, and worth saying why: p-2 was never what was wrong.
 * It was applying correctly the whole time — the slots were simply being laid
 * out past it.
 */
/* Untitled UI's surface on the capsule, and nothing else about this bar changed
   (FB-0015). The glass fill, the blur and the hand-tuned shadow are theirs now —
   the same three the card surfaces took — but the shape, the widths, the slots
   and the sliding pill are untouched. `rounded-btn` stays: it is the pill
   radius, this bar is a pill, and ADR-0057 left that token alone precisely
   because it is not one of Tailwind's names. */
export const tabbarPagesClassName =
  "tabbar-pages relative flex items-center justify-center gap-2 w-auto min-w-0 p-2 " +
  "bg-primary ring-1 ring-secondary ring-inset rounded-btn shadow-lg";

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
 * flex-initial min-w-0: each slot is as wide as its own label ("Dashboard"
 * wider than "You"), and every slot may shrink. This replaces a fixed
 * `flex-none w-[var(--tab-w,104px)] min-w-[56px]`, where --tab-w was measured
 * from the widest label by an effect in CardsTabBar.tsx (now deleted with it)
 * so that every slot came out the same width and the pill kept one size as it
 * slid. ADR-0050 reverses that on instruction, because equal-width slots are
 * what made the row wider than the bar: four fixed slots plus the add circle
 * need 390px, a 360px phone gives the track 328, and slots that cannot shrink
 * simply overflow — out of both ends of the capsule, since the track centres
 * them, which is what "the pill has no margin left or right" actually was.
 *
 * The pill therefore changes width as it moves now. useSlidingPill already
 * transitions width and height alongside transform, so it resizes and slides
 * in one motion; that was written for this and never used.
 *
 * min-w-0 is the part that is easy to drop and load-bearing: without it a
 * flex item's automatic minimum is its min-content width, a nowrap label is
 * as wide min-content as max-content, and the row would go back to
 * overflowing below about 340px instead of letting `truncate`
 * (tabbarLabelClassName) do its job. The icon's own shrink-0 keeps a slot
 * from collapsing past its icon, which is the real floor `min-w-[56px]` used
 * to be.
 *
 * px-1.5, not px-2: the four full labels are 3px too wide for a 360px phone
 * at 8px, and fit at 6px. It also makes the pill's own inner padding equal on
 * all four sides, py-1.5 being what it already was.
 */
export const tabbarItemClassName =
  "tabbar-item group relative z-[1] flex flex-col items-center justify-center gap-0.5 flex-initial min-w-0 " +
  "px-1.5 py-1.5 border border-transparent rounded-btn bg-transparent cursor-pointer text-secondary no-underline " +
  "transition-colors duration-100 ease-linear [&:not(.is-active):hover]:opacity-70";

export const tabbarIconClassName = "flex shrink-0";

/** Always visible now, under the icon — no longer collapsed for anything but
 *  the active tab. Requires the ancestor .tabbar-item to also carry
 *  Tailwind's `group` class (tabbarItemClassName does), kept even though
 *  nothing here reads `group-[...]` any more: CardsTabBar.tsx's `item()`
 *  still applies "group" unconditionally and there is no reason to make
 *  that conditional for one class that stopped needing it. */
/** max-w-full + truncate: the slot is sized to this label now
 *  (tabbarItemClassName), so on a wide enough screen these never fire. They
 *  are what happens below roughly 340px, where the slots have to give up
 *  width to keep the capsule on the screen: "Dashboa…" is the price of a bar
 *  that still fits, and it is paid by the label rather than by the layout. */
export const tabbarLabelClassName =
  "tabbar-label max-w-full truncate text-xs leading-none";

/** The same glass-lift surface the sidebar's rows use for hover/active
 *  (.cards-nav-item::after, components.css) — was solid black
 *  (bg-brand-solid), changed on explicit instruction so the
 *  sidebar and the tabbar read as the same visual language rather than the
 *  sidebar's rows lifting onto glass and the active tab sitting on a filled
 *  black pill. Include "is-ready"/"is-animated" alongside this as the
 *  pill's placement settles. */
export const tabbarPillClassName =
  "tabbar-pill absolute left-0 top-0 z-0 rounded-btn bg-secondary " +
  "ring-1 ring-secondary ring-inset " +
  "shadow-xs opacity-0 pointer-events-none " +
  "[&.is-ready]:opacity-100 " +
  "[&.is-animated]:transition-[transform,width,height] duration-[380ms] ease-out";

/**
 * The plus in the middle of the track. Was `.cards-tabbar-add` in cards.css
 * and moved here by ADR-0050, because one line of it was half of the bug:
 * `width: min(var(--control-h), 100%)`, written so the circle could squeeze
 * on a phone narrower than its slot. A percentage inside that min() is
 * something the browser cannot resolve while it computes an intrinsic width,
 * so the circle counted as ~0 towards the track's max-content and the
 * track's min-w-max under-reserved by exactly these 40px. A plain
 * w-10 instead: the slots beside it shrink now, so nothing
 * needs this one to.
 *
 * flex-none for the reason the old comment gave and is worth keeping: with
 * flex: 1 1 0 this stopped being a circle at all, because a plain width on a
 * flex item is not a constraint the algorithm honours over a grown basis.
 *
 * No literal "cards-tabbar-add" class alongside it, unlike tabbar-pages /
 * tabbar-item / tabbar-label, which cards.css and useSlidingPill still reach
 * by name: with the CSS block gone nothing selects this one any more, and a
 * hook name left behind for no reader is how the next pass ends up editing a
 * rule that cannot apply.
 *
 * The colour is --btn-primary-bg, the same one every other primary action uses,
 * on explicit instruction; it was --color-tint, an accent deliberately not this
 * bar's black. That does trade away "one ink for where you are, one for what you
 * can do": the pill and this button match, told apart by position.
 *
 * "The same black" is what this said, and it was true until the Untitled UI
 * conversion: --btn-primary-bg is Untitled UI's brand now, which is this app's
 * blue, so every primary surface went from near-black to blue at once
 * (ADR-0060). The sentence above still holds — it is the *same* colour as every
 * other primary action, which was always the point — but the colour changed.
 */
export const tabbarAddClassName =
  "grid place-items-center flex-none z-[1] " +
  "size-10 p-0 border-0 rounded-full cursor-pointer " +
  "bg-brand-solid text-white hover:bg-brand-solid_hover shadow-xs-skeuomorphic " +
  "transition duration-100 ease-linear";
