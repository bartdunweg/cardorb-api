// Shared between Segmented.tsx and the three places that draw the same
// track-of-buttons by hand (CardsProfile's light/dark toggle, FilterOptions'
// and ViewOptions' facet switches) rather than through the component, because
// each needs its own click handling around the same look.
//
// width stays in cards.css: several ancestor contexts (the mobile toolbar,
// .sheet, .view-menu-panel, .filter-menu-panel) set it to 100% and none of
// these callers know which one they're in.
export const cardsSegmentedClassName = "cards-segmented flex gap-1 p-[3px] rounded-pill";

// padding and flex stay in cards.css: the filter/view panel contexts override
// both on .cards-segment, and an unconditional Tailwind utility would always
// beat that (see ADR-0017).
export function cardsSegmentClassName(active: boolean) {
  return (
    "cards-segment h-8 border-none bg-transparent [font-family:var(--font-main)] " +
    "[font-size:var(--fs-control-label)] [font-weight:var(--fw-button)] text-label-secondary cursor-pointer " +
    "[border-radius:calc(var(--radius-pill)-4px)] " +
    "[transition:color_var(--dur-fast)_var(--ease-smooth),background_var(--dur-fast)_var(--ease-smooth)] " +
    "hover:text-label" +
    (active ? " is-active bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "")
  );
}

// The same track, for the grid/list layout toggle. width stays in cards.css:
// .view-menu-panel sets it to 100% and ViewOptions.tsx has no way to know
// whether it landed there or in the sheet.
export const cardsViewsClassName = "cards-views flex gap-[2px] p-[3px] rounded-pill";

export function cardsViewClassName(active: boolean) {
  return (
    "cards-view flex items-center justify-center w-8 h-8 border-none bg-transparent " +
    "text-label-tertiary cursor-pointer [border-radius:calc(var(--radius-pill)-4px)] " +
    "[transition:color_var(--dur-fast)_var(--ease-smooth),background_var(--dur-fast)_var(--ease-smooth)] " +
    "hover:text-label" +
    (active ? " is-active bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]" : "")
  );
}
