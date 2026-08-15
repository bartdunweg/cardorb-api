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

export const tabbarClassName =
  "fixed w-[var(--lock-vw,100%)] left-0 right-0 bottom-0 z-[var(--z-tabpage)] [transform:translateZ(0)] " +
  "flex items-center justify-center gap-4 " +
  "[padding:var(--space-6)_var(--space-4)_calc(var(--space-6)+env(safe-area-inset-bottom,0px))] " +
  "pointer-events-none [&>*]:pointer-events-auto " +
  "[@media(max-width:640px)]:gap-2 " +
  "[@media(max-width:640px)]:[padding:var(--space-4)_calc(var(--space-3)+var(--control-h)+var(--space-3))_calc(var(--space-4)+env(safe-area-inset-bottom,0px))_calc(var(--space-3)+var(--control-h)+var(--space-3))] " +
  "[@media(min-width:1001px)]:!hidden";

export const tabbarPagesClassName =
  "tabbar-pages relative flex items-center justify-center w-auto p-2 " +
  "bg-[var(--glass-bg-solid)] border border-[var(--glass-border)] rounded-btn " +
  "[box-shadow:var(--shadow-elevated)] [backdrop-filter:blur(var(--blur-glass))] " +
  "[@media(max-width:640px)]:max-w-[calc(100vw-2*(var(--space-3)+var(--control-h)+var(--space-3)))]";

/** Include the literal "is-active" class alongside this when the tab is selected. */
export const tabbarItemClassName =
  "tabbar-item group relative z-[1] flex items-center justify-center flex-none min-w-0 h-10 px-4 " +
  "border border-transparent rounded-btn bg-transparent cursor-pointer text-label no-underline " +
  "[transition:color_var(--dur-fast)_var(--ease-in-out),flex-grow_var(--dur-normal)_var(--ease-in-out)] " +
  "[&.is-active]:text-[var(--btn-primary-text)] [&:not(.is-active):hover]:opacity-70 " +
  "[@media(max-width:640px)]:px-[10px] " +
  "[@media(max-width:640px)]:[&.is-active]:min-w-[114px] [@media(max-width:640px)]:[&.is-active]:px-4";

export const tabbarIconClassName = "flex shrink-0";

/** Requires the ancestor .tabbar-item to also carry Tailwind's `group` class (tabbarItemClassName does). */
export const tabbarLabelClassName =
  "tabbar-label " +
  "[@media(max-width:640px)]:max-w-0 [@media(max-width:640px)]:opacity-0 [@media(max-width:640px)]:ml-0 " +
  "[@media(max-width:640px)]:[transition:opacity_var(--dur-fast)_var(--ease-smooth)] " +
  "[@media(max-width:640px)]:group-[.is-active]:max-w-[160px] [@media(max-width:640px)]:group-[.is-active]:opacity-100 " +
  "[@media(max-width:640px)]:group-[.is-active]:ml-2";

/** Include "is-ready"/"is-animated" alongside this as the pill's placement settles. */
export const tabbarPillClassName =
  "tabbar-pill absolute left-0 top-0 z-0 rounded-btn bg-[var(--btn-primary-bg)] " +
  "[box-shadow:var(--shadow-card)] opacity-0 pointer-events-none " +
  "[&.is-ready]:opacity-100 " +
  "[&.is-animated]:[transition:transform_0.38s_var(--ease-smooth),width_0.38s_var(--ease-smooth),height_0.38s_var(--ease-smooth)]";
