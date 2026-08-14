/**
 * .page-cards from app/styles/cards.css — the full-bleed two-pane shell,
 * shared by app/(app)/layout.tsx (owner) and app/user/[username]/page.tsx
 * (public). The negative top margin takes back --main-pad-top, which
 * reserves room for a tab bar this route deliberately does not have.
 */
export const pageCardsClassName =
  "grid grid-cols-[300px_minmax(0,1fr)] items-start bg-[var(--glass-bg-solid)] min-h-screen min-h-dvh " +
  "[margin:calc(-1*var(--main-pad-top))_auto_0] [padding:0_0_var(--page-pad-bottom)] " +
  "[@media(max-width:1000px)]:grid-cols-[minmax(0,1fr)] " +
  "[@media(max-width:640px)]:[margin-top:0] " +
  "[@media(min-width:641px)_and_(max-width:1000px)]:[padding-bottom:calc(var(--space-6)+var(--tabbar-pill-h)+var(--space-10))]";

/**
 * .cards-main from cards.css. The class name stays (not just the Tailwind
 * utilities): cards.css's container queries throughout the file measure
 * against this box by name (`container-type: inline-size` needs a name-based
 * selector target for `@container` to bind to at every call site), and the
 * mobile pane-swap is written as the sibling selector
 * `.cards-rail[data-pane="rail"] + .cards-main` — remove the name and both
 * break silently. AppShell.tsx's own comment calls this out: the rail and
 * .cards-main must stay literal siblings, in that order.
 */
export const cardsMainClassName =
  "cards-main @container min-w-0 flex flex-col gap-5 " +
  "[padding:var(--space-8)_var(--page-pad-x)_0_var(--space-6)] " +
  "[@media(max-width:1000px)]:[padding:var(--space-5)_var(--page-pad-x)_0]";
