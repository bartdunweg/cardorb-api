/**
 * Tailwind classes for the floating tab bar. Used to be app/styles/tabbar.css +
 * app/styles/layout.css.
 *
 * CardsTabBar.tsx is the only consumer now. (app)/loading.tsx used to draw the
 * same bar as a skeleton and draws nothing but the orb — ADR-0091.
 *
 * "tabbar-item" and "is-active" stay as literal class names alongside the
 * Tailwind utilities below, because useSlidingPill.ts queries
 * ".tabbar-item.is-active" directly to measure the active slot. "tabbar-pages"
 * and "tabbar-label" are hooks with no reader left: cards.css used to reach them
 * by name from `.cards-tabbar .tabbar-pages` etc., and cards.css is gone. They
 * are kept only because a stylesheet is not the only thing that can select a
 * name — leave them, and remove them together with a search, not on sight.
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

// The gradient's opaque end has to be exactly what the route behind it paints,
// or the scrim ends in a band rather than in the page. That is
// pageCardsClassName's `bg-secondary`, so this reads --color-bg-secondary and
// must keep tracking it if that constant ever moves. It used to read
// --color-bg-grouped, a token from the pre-Untitled-UI palette that no surface
// has been painted with since ADR-0061: #181818 fading over a #0a0a0a canvas,
// which is the band this is written to avoid, visible on every dark-mode phone.
export const tabbarFadeClassName =
  "fixed w-[var(--lock-vw,100%)] left-0 right-0 bottom-0 h-36 z-[var(--z-tabbar)] pointer-events-none " +
  "[background:linear-gradient(to_top,var(--color-bg-secondary)_20%,color-mix(in_srgb,var(--color-bg-secondary)_80%,transparent)_50%,color-mix(in_srgb,var(--color-bg-secondary)_0%,transparent)_100%)] " +
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
 * One value — p-2, and gap-2 to match — for every gap this track has: between
 * the capsule's own edge and the leftmost/rightmost slot, between each slot and
 * its neighbour, and (via p-2's vertical half) above and below every slot. On
 * explicit instruction: not a bigger horizontal number than vertical (an earlier
 * pass's px-3/py-2, guessing the rounded corner ate into a smaller horizontal
 * inset) and not a smaller inter-item gap than the edges (gap-1) — one number,
 * applied everywhere a gap exists here, so nine seemingly-independent spacing
 * bugs can't reopen this file nine more times.
 *
 * Untouched by ADR-0050 and ADR-0086, and worth saying why: p-2 was never what
 * was wrong. It was applying correctly the whole time — the slots were simply
 * being laid out past it.
 */
/* Untitled UI's surface on the capsule, and nothing else about this bar changed
   (FB-0015). The glass fill, the blur and the hand-tuned shadow are theirs now —
   the same three the card surfaces took — but the shape, the widths, the slots
   and the sliding pill are untouched. `rounded-btn` stays: it is the pill
   radius, this bar is a pill, and ADR-0057 left that token alone precisely
   because it is not one of Tailwind's names. */
/**
 * grid grid-flow-col auto-cols-fr, where this was a flex row: every slot is the
 * width of the widest label now, which is what FB-0022 asked for and what
 * ADR-0086 explains at length. Three things about it are worth knowing before
 * touching this line.
 *
 * `auto-cols-fr` is `grid-auto-columns: minmax(0, 1fr)`, and in a grid container
 * whose width is indefinite — which this is, `w-auto` — every `1fr` track
 * resolves to the *maximum* of the tracks' max-content sizes. So "all equal, at
 * the widest" is not something computed here; it is the definition of an fr
 * track. ADR-0030 hand-rolled this with a --tab-w var measured by three hooks
 * racing a font load, and ADR-0050 deleted the lot. Neither should come back.
 *
 * The `minmax(0, …)` half is the part that keeps ADR-0050's fix. Plain `1fr` is
 * `minmax(auto, 1fr)`, whose floor is the track's min-content size, and a row of
 * nowrap labels that cannot go below min-content overflows a narrow phone — the
 * exact failure FB-0011 reported. With a 0 floor the tracks shrink together
 * instead and the labels truncate equally.
 *
 * `grid-flow-col` rather than an explicit template, because the slot count is
 * not fixed: four signed in, three on the public /user/<name> bar. Implicit
 * columns size by the same rule, so both counts come out of one class string
 * with no inline style and no branch.
 */
/**
 * min-w-0, where this used to say min-w-max and a `<=640px` max-w cap. Both are
 * gone, and the reason is ADR-0050: the pill was drawn *outside* the capsule's
 * left and right edges, not short of a margin inside them. min-w-max was meant
 * to widen the capsule to whatever its slots need, and a track that is allowed
 * to be wider than the bar has room for will overflow somewhere — with the
 * contents centred, symmetrically out of both ends. min-w-0 lets it shrink, the
 * tracks above shrink with it, and the <nav>'s own calc(var(--spacing)*4) side
 * padding is then the only thing deciding the outer margin.
 *
 * No max-w either: w-auto hugs the content, and the nav's padding caps it. The
 * old `calc(100vw - 2*calc(var(--spacing)*4))` said the same thing in a second
 * place, in viewport units that quietly include a scrollbar between 641 and
 * 1000px where this bar is still shown.
 */
export const tabbarPagesClassName =
  "tabbar-pages relative grid grid-flow-col auto-cols-fr items-center gap-2 w-auto min-w-0 p-2 " +
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
 * No width and no flex sizing here at all: this is a grid item now, and the
 * track it sits in decides how wide it is (tabbarPagesClassName). Every slot
 * therefore comes out the width of the widest label — FB-0022 — instead of the
 * width of its own, which is what `flex-initial` gave it between ADR-0050 and
 * ADR-0086, and what made the avatar slot visibly the narrowest of the four:
 * "You" is the shortest word in the bar, and since the avatar is size-5, exactly
 * as wide as every other icon, the label was the only thing left to differ.
 *
 * The `flex flex-col` that remains is the slot's own inside — icon over label —
 * not how it is placed in the row. Do not read it as the old layout.
 *
 * min-w-0 is the part that is easy to drop and load-bearing, for the same reason
 * it was under flex: a grid item's automatic minimum is its min-content size
 * too, a nowrap label is as wide min-content as max-content, and without this
 * the slots would refuse to shrink and the row would overflow below about 340px
 * instead of letting `truncate` (tabbarLabelClassName) do its job. The icon's
 * own shrink-0 keeps a slot from collapsing past its icon.
 *
 * px-1, and it stopped meaning what it used to mean. While a slot hugged its own
 * label this was the space around the words, and ADR-0050 set it to px-1.5 so
 * the pill's inner padding came out equal on all four sides. Neither is true
 * now: the track decides the slot's width, the label is centred in whatever it
 * gets, and above about 375px that is already more room than any padding here
 * reserves — so this value is invisible except when the bar is being squeezed.
 * What it is now is the truncation floor, the last room a label keeps before
 * `truncate` takes over, and 4px is what puts "Dashboard" through a 360px phone
 * intact. Measured, not estimated: at px-1.5 it read "Dashbo…" there.
 *
 * py-1.5 is untouched. It is still the real vertical padding, because nothing
 * stretches a slot's height.
 *
 * The pill keeps one size as it slides again, since every slot is now one size.
 * useSlidingPill still transitions width and height alongside transform, so a
 * slot count changing under it (four signed in, three public) still animates.
 */
export const tabbarItemClassName =
  "tabbar-item group relative z-[1] flex flex-col items-center justify-center gap-0.5 min-w-0 " +
  "px-1 py-1.5 border border-transparent rounded-btn bg-transparent cursor-pointer text-secondary no-underline " +
  "transition-colors duration-100 ease-linear [&:not(.is-active):hover]:opacity-70";

export const tabbarIconClassName = "flex shrink-0";

/** Always visible now, under the icon — no longer collapsed for anything but
 *  the active tab. Requires the ancestor .tabbar-item to also carry
 *  Tailwind's `group` class (tabbarItemClassName does), kept even though
 *  nothing here reads `group-[...]` any more: CardsTabBar.tsx's `item()`
 *  still applies "group" unconditionally and there is no reason to make
 *  that conditional for one class that stopped needing it. */
/** max-w-full + truncate: every slot is sized to the *widest* label now
 *  (ADR-0086), so on a wide enough screen these never fire — not even for the
 *  widest one. They are what happens below roughly 340px, where the tracks have
 *  to give up width together to keep the capsule on the screen: "Dashboa…" is
 *  the price of a bar that still fits, and it is paid by the label rather than
 *  by the layout. */
export const tabbarLabelClassName = "tabbar-label max-w-full truncate text-xs leading-none";

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

/*
 * There is no tabbarAddClassName any more, and the deletion is the point.
 *
 * A 40px add circle used to sit in the middle of this track, and it is what made
 * equal-width slots impossible: four slots at the widest label plus the circle
 * need ~366px, and a 360px phone gives the track 328. ADR-0086 takes the circle
 * out of the bar entirely — on instruction, and explicitly as a temporary move —
 * so the four slots can be equal. It lives on the dashboard's title row now
 * (CardsDashboard.tsx), built from Untitled UI's own Button rather than from a
 * class string, the same way the rail's plus already was.
 *
 * The export went with it rather than being left behind. This file's own history
 * is the argument: a hook name kept for no reader is how the next pass ends up
 * editing a rule that cannot apply.
 */
