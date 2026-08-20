// Shared between Segmented.tsx and the three places that draw the same
// track-of-buttons by hand (CardsProfile's light/dark toggle, FilterOptions'
// and ViewOptions' facet switches) rather than through the component, because
// each needs its own click handling around the same look.
//
// width stays in cards.css: several ancestor contexts (the mobile toolbar,
// .sheet, .view-menu-panel, .filter-menu-panel) set it to 100% and none of
// these callers know which one they're in.
export const cardsSegmentedClassName =
  // max-sm:w-full was `@media (max-width: 640px) { .cards-segmented { width: 100% } }`.
  // A conditional utility, so the panel contexts' own [&_.cards-segmented]:w-full
  // still reads the same at every width.
  "cards-segmented flex gap-1 p-[3px] rounded-pill max-sm:w-full " +
  // The track's own surface. Was a grouped selector in components.css reaching
  // five controls at once; each of them names it for itself now.
  "bg-secondary ring-1 ring-secondary ring-inset";

// `max-sm:` on both, which is what makes it safe to bring them here at all.
// cards.css set flex/padding on .cards-segment only below 640px, and the filter
// and view panels set them unconditionally through [&_.cards-segment]. An
// unconditional utility here would have beaten those (ADR-0017); a conditional
// one loses to them the same way the media query did.
export function cardsSegmentClassName(active: boolean) {
  return (
    "cards-segment h-8 border-none bg-transparent [font-family:var(--font-main)] " +
    "max-sm:flex-1 max-sm:px-2 " +
    "[font-size:var(--fs-control-label)] [font-weight:var(--fw-button)] text-secondary cursor-pointer " +
    "[border-radius:calc(var(--radius-pill)-4px)] " +
    "[transition:color_var(--dur-fast)_var(--ease-smooth),background_var(--dur-fast)_var(--ease-smooth)] " +
    "hover:text-primary" +
    (active ? " is-active bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "")
  );
}

// The same track, for the grid/list layout toggle. width stays in cards.css:
// .view-menu-panel sets it to 100% and ViewOptions.tsx has no way to know
// whether it landed there or in the sheet.
export const cardsViewsClassName =
  "cards-views flex gap-[2px] p-[3px] rounded-pill bg-secondary ring-1 ring-secondary ring-inset";

export function cardsViewClassName(active: boolean) {
  return (
    "cards-view flex items-center justify-center w-8 h-8 border-none bg-transparent " +
    "text-tertiary cursor-pointer [border-radius:calc(var(--radius-pill)-4px)] " +
    "[transition:color_var(--dur-fast)_var(--ease-smooth),background_var(--dur-fast)_var(--ease-smooth)] " +
    "hover:text-primary" +
    (active ? " is-active bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "")
  );
}
