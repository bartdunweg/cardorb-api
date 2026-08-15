---
id: ADR-0030
title: "Mobile tab bar: \"Settings\" becomes \"You\" (with avatar), track min-width fix"
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [tabbar, cascade-layers, profile]
---

# Mobile tab bar: "Settings" becomes "You" (with avatar), track min-width fix

## Context and problem statement

Bart asked to refine the mobile tab bar (`CardsTabBar.tsx`, shown below 1000px
in the signed-in app shell via `AppTabBar.tsx`, and inline in `CardsView.tsx`
for the public `/user/[username]` link): the last slot, labelled "Settings"
with a gear icon, should read "You" and show the account's avatar instead —
"settings moet dan denk ik profile heten en icoontje moet je avatar zijn" ...
"noem het maar 'you'". Separately: the active-tab pill was reading flush
against the bar's left/right edges instead of matching its own top/bottom
inset — "de active state van die dingen zit nu helemaal tot aan zijkanten...
moet zelfde padding zegmaar hebben als boven en onder", and later, once the
cause was clear: "de width van de tabbar moet minimaal de width zijn van de
breedte van de content." Several more requests followed in the same session:
"iedere tab in mobile tabbar moet zelfde 'width' hebben" (every tab the same
width, not sized to its own label); "die tabbar de items in die tabbar
hebben nog steeds te weinig ruimte, label moet sowieso helemaal passen" (the
first equal-width pass was too narrow — "Dashboard" was clipping); "ja
alleen de ruimte links en rechts is nog 0 aan de rand van de tabbar" (the
min-w-max fix had stopped the pill reading flush against its own item, but
the capsule itself was still reading flush against the screen edges);
"zelfde title style als dashboard ook voor andere pagina's" (make the new
Dashboard title's style consistent everywhere, not just on Dashboard); and,
after seeing "You" open `/settings`: "klikken op profile moet gewoon
sidebar of tabbar in beeld houden dit niet een 'aparte pagina' gewoon
zelfde opzet als andere pagina's" — Settings was dropping the sidebar/tab
bar entirely instead of staying inside the shell like `/dashboard`,
`/collection`, `/wishlist`. Two screenshots after the edge-padding fix
("ik zie het niet, dit is wat ik bedoel") showed the real bar still reading
"Dashbo…" — the 72px estimate was still wrong, on a real device's font
metrics, by more than the earlier reasoning accounted for. Once that was
fixed: "ja maar ook geen ruimte links en rechts en actieve tab tov plusje" —
the same screenshot also showed the active pill (behind "Collection")
reading as touching the add circle beside it directly, no gap at all. One
more round after that gap landed: "links en rechts in tabbar zit er geen
gap... helemaal links en helemaal rechts van meest linkse en rechtse item
moet dat ook" — the leftmost/rightmost slot still read as flush against the
capsule's own edge, even though the track's `p-2` gave it the same 8px
inset as top/bottom on paper. That fix (splitting into `py-2 px-3`) missed
the actual ask: "even veel ruimte links en rechts en tussen plus en items...
als we ruimte hebben boven en onder item" — one equal amount everywhere,
not a bigger horizontal number.

## What was found

- The signed-in app shell's actual mobile bar is `AppTabBar.tsx` (route-driven,
  used from `AppShell.tsx`). `CardsView.tsx` also renders a `CardsTabBar`
  inline, but only reaches it for `variant === "public"` — the owner path
  returns early (`if (!isPublic) return main;`) before that markup, so that
  copy is dead for the signed-in case. `AppTabBar.tsx` was the one to fix.
- The `"settings"` slot didn't do anything useful even before this: it mapped
  to `/settings` in `AppTabBar`'s href table, which was already correct, but
  `CardsView`'s inline copy called `openPane("settings")`, a key no pane
  branch in that file checks (`onProfile` only matches `selected ===
  "profile"`) — moot in practice since that code path is unreachable for
  owners, but confusing enough to fix alongside the rename rather than leave
  as a trap for a future pass.
- The pill-touches-the-edges symptom was a fourth instance of the cascade-
  layer pattern already documented in `ADR-0012`, `ADR-0017`, and `ADR-0028`:
  `tabbarPagesClassName`'s track is `w-auto` with a `max-w-[calc(100vw-...)]`
  cap below 640px, meant only to reserve room `cards.css` intentionally undoes
  (`max-width: none`) on this route. But that `cards.css` override lives in
  the `legacy` layer, which always loses to `utilities` (where every Tailwind
  class lives) once both rules match — so the cap kept applying. Four
  labelled slots plus the add circle can be wider than that capped track on a
  narrow phone, and slots don't shrink or wrap (`flex-none`), so they
  overflowed the glass capsule: the pill for an active edge slot then measured
  flush against the capsule's edge instead of inset by the track's own `p-2`,
  same as `ADR-0028` found for `display: none` losing to `flex` the same way.
- The min-w-max fix above stopped the track being squeezed below its own
  content, but "0 space at the edges" persisted for a related reason at the
  layer above: `tabbarClassName`'s own `<=640px` padding reserves
  `space-3 + control-h + space-3` (~64px) on each side — room for a theme
  toggle this route never renders, per `cards.css`'s own comment ("There is
  no toggle on this route to reserve for"), which tries to cancel that
  reservation with `padding-inline: var(--space-4)`. Same cascade-layer loss
  as everywhere else in this file: `legacy` never beats `utilities`, so the
  ~128px phantom reservation (both sides) was still real, on top of the
  track's own now-widened content (4 slots at the corrected 72px plus the
  add circle). Forcing the track to its full content width via min-w-max,
  inside a nav whose own side padding had already eaten ~128px it didn't
  need to, pushed the capsule's edges past the nav's own available width —
  on a narrow phone, past the viewport itself. An overflowing, centred
  element reads as "no margin" from inside the visible viewport for the same
  reason a squeezed one does: either way, there is no gap between an edge
  tab and the screen edge, just for opposite reasons.
- `app/(app)/layout.tsx`'s own comment already says "/dashboard, /collection
  and /settings share one shell", and `AppSidebar.tsx`'s `selectedFrom`/`go`
  already treat `/settings` as one of the rail's own destinations (mapped to
  its `"profile"` row, `AppSidebar.tsx:28,55`). But `app/settings/layout.tsx`
  was its own, separate top-level layout — not nested under `app/(app)/`,
  so none of that shell (`AppShell`, its sidebar, its tab bar) ever actually
  wrapped it, and it re-implemented its own auth redirect and its own "← Card
  Orb" back link instead. Two parts of the codebase disagreed about whether
  Settings was in the shell; only one of them was true. This reads as an
  unfinished move rather than a deliberate, still-current design — `AppShell`
  was seemingly meant to reach `/settings` and never did.

## Decision

- `CardsTabBar.tsx`: renamed the shared `"settings"` key/slot to `"profile"`,
  label "You". Icon rendering is special-cased per-tab now: the `"profile"`
  slot shows the viewer's avatar image (Supabase Storage URL, same as
  `CardsSidebar.tsx`'s footer) when one is set, else a circle with their
  initial (same fallback `CardsSidebar.tsx` already uses) — not a lucide icon.
  `UserRound` stays as the type-level fallback icon for the rare case no
  `viewer` prop is supplied at all.
- `AppTabBar.tsx`: passes `viewer` through from `useCollection()` (already
  available there via `CollectionContext`), and its `tabFrom`/`HREF` maps were
  updated from `"settings"` to `"profile"` — still routes to `/settings`,
  there is no separate `/profile` route to send it to instead.
- `CardsView.tsx`'s inline copy was updated for type consistency (the shared
  `CardsTab` union changed) and given a matching `onProfile` branch in
  `activeTab`, but not wired up with a `viewer` prop — that path is
  unreachable for owners and excludes the profile slot entirely for the
  public variant (`isPublic` accounts have no profile to show), so there is
  nothing for it to render there.
- `tabbarClasses.ts`: added `min-w-max` to `tabbarPagesClassName`. A
  conflicting `min-width` always wins over `max-width` by spec, so this lets
  the 640px cap only ever shrink the track back down to what its slots
  actually need, never past it — fixed at the source (same file/layer as the
  rule it has to beat) rather than by deleting `cards.css`'s already-losing
  override, consistent with how `ADR-0028` chose to fix its instance of this.
- `tabbarClassName`'s `<=640px` side padding changed from
  `space-3 + control-h + space-3` to plain `var(--space-4)`, and
  `tabbarPagesClassName`'s `<=640px` cap from
  `calc(100vw-2*(space-3+control-h+space-3))` to
  `calc(100vw-2*var(--space-4))` — both baked directly into this
  (`utilities`-layer) file instead of trusting `cards.css`'s `legacy`-layer
  cancellation to win a cascade fight it structurally cannot. `min-w-max`
  stays as a safety net rather than the primary fix, in case the 72px
  per-slot estimate still undershoots on some device.
- `tabbarItemClassName` changed from `min-w-[56px]` (sized to whatever each
  slot's own label needed) to a fixed equal width on every slot, with
  `tabbarLabelClassName` given `max-w-full truncate` as a safety net. Went
  through two static guesses before giving up on guessing: `w-16` (64px,
  clipped immediately), then a deliberately-computed `w-[72px]` (~56-58px
  estimated for "Dashboard" at `--fs-tiny`/11px, plus `px-2`'s 16px) — which
  *also* clipped, to "Dashbo…", confirmed by a real screenshot. Real font
  metrics ran wider than the estimate both times, so the third pass stopped
  guessing: `CardsTabBar.tsx` now measures every `.tabbar-label`'s actual
  `scrollWidth` (which reports the true content width even while `truncate`
  is visually clipping it, so no need to first disable truncation to
  measure) in a `useLayoutEffect`, takes the widest, and sets it as a
  `--tab-w` CSS var on the track — `tabbarItemClassName` reads
  `w-[var(--tab-w,72px)]`, 72px staying only as the one-paint-before-JS-runs
  fallback. Re-measured on `document.fonts.ready` too, same pattern
  `useSlidingPill` already uses for the same reason (a font loading
  `display: swap` after first paint). Equal widths also mean the sliding
  pill only ever translates between slots, never resizes — a smaller version
  of the same "every slot already sized for its label" intent
  `tabbarItemClassName`'s own comment described for the icon-over-label
  change, just applied across slots instead of within one.
- The measured-width fix still shipped a clipped "Dashboard" on a real
  device once more, root cause not conclusively identified (font load
  timing, a Turbopack HMR staleness during rapid iteration, something else —
  the measurement logic itself checks out under static reading and the
  scrollWidth technique is standard). Rather than keep guessing at the exact
  failure, hardened on two fronts instead of one: added a `ResizeObserver`
  on the labels alongside the existing mount + `document.fonts.ready`
  triggers (`CardsTabBar.tsx`), and — the part that actually guarantees the
  symptom can't recur regardless of whether any JS trigger fires correctly
  on a given device — widened `tabbarItemClassName`'s *static fallback* from
  a tight 72px estimate to a deliberately generous 104px. The measured value
  still wins once/if it runs; the fallback is what the user actually sees if
  it doesn't.
- `tabbarPagesClassName` gained `gap-1`: the track's flex children (tab
  items, add circle) had no gap between them at all, so an active pill —
  sized to match its own item's bounding box, `useSlidingPill` — read as
  touching its neighbour directly whenever that neighbour was the add
  circle, with no breathing room. 4px, not the outer nav's own gap-4/gap-2:
  this is spacing inside one compact bar, not between the bar and the page.
- `tabbarPagesClassName`'s uniform `p-2` was first split into `py-2 px-3` on
  a guess (the capsule's own rounded corner visually eating into a
  straight-edge horizontal inset near the corner) — wrong direction: asked
  for one equal amount everywhere instead, not a bigger horizontal number.
  Settled on `p-2` **and** `gap-2` (both 8px, was `gap-1`/4px): edge inset,
  inter-item gap and the item's own vertical padding-to-capsule-edge are now
  the same single value, deliberately, so this doesn't reopen as nine
  separate-looking spacing reports again.
- `app/settings/**` (except `password/`) moved into `app/(app)/settings/**`,
  so `app/(app)/layout.tsx` and `AppShell` now wrap it like every other
  signed-in screen — sidebar and tab bar stay on screen. Its own
  `layout.tsx` dropped the now-redundant `currentViewer()`/`redirect()` guard
  (the parent layout already does this for the whole group) and the "← Card
  Orb" link (the rail replaces it), keeping only the page's own `<h1>` and
  the signed-in email line. `app/settings/password/page.tsx` was
  deliberately **not** moved: it renders `SigninShell`, the same full-page,
  own-`Navbar`, `min-h-screen`-centred chrome `/login`/`/signup`/
  `/password/forgotten` use, because it is reachable from an unauthenticated
  password-recovery link as well as from a signed-in "change password"
  action — nesting it under `AppShell` would have doubled up chrome (two
  navbars) for no benefit, and lost its own more specific expired-link error
  redirect to the parent layout's generic one. It keeps working exactly as
  before, unmoved, using the root layout the other door screens already use.

## Consequences

- Good: "You" tab shows a real avatar (or initial) instead of a generic gear;
  the active pill gets equal inset on every side once the track can no longer
  be squeezed narrower than its content.
- Bad, self-critical: this is the fourth *and* fifth occurrence of the same
  cascade-layer failure mode (`ADR-0012`, `0017`, `0028`) in one file, and
  the second one (the padding reservation) was found only because the first
  fix (min-w-max alone) didn't actually resolve what it looked like it
  should — worth remembering next time a min-width/max-width fight in this
  codebase doesn't fully explain what's on screen. No regression test
  exists for any of the five. `cards.css`'s now-doubly-inert `max-width:
  none` and `padding-inline: var(--space-4)` rules at 640px were left in
  place for the same reason `ADR-0028` left its dead rule: deleting
  still-referenced-looking legacy CSS during an unrelated fix is more risk
  than the dead weight is worth.
- Bad, self-critical, separate lesson: two static pixel estimates for
  "how wide does this label render" were both wrong, the second one only
  caught because the user sent an actual screenshot. Font-metric guesses
  from a token value (`--fs-tiny`) without measuring the real DOM should
  have been distrusted sooner — `useSlidingPill` already had the working
  pattern (measure the real element, don't compute from a font-size) sitting
  in the same file this bar imports it from.
- Neutral: confirmed by `npm run check` (typecheck/test/lint, all green) and
  code/CSS inspection. Not confirmed by a live signed-in screenshot at mobile
  widths — this workspace's browser automation cannot sign in (entering a
  password/passcode through it is out of scope for that tooling), so the
  visual result on `/dashboard`, `/collection`, `/wishlist` and `/settings` at
  ≤1000px is worth a real check before considering this fully closed.
- Neutral: the old `app/settings/layout.tsx` comment's stated reason for
  keeping Settings out of the shell — "paying a megabyte of cards to render a
  form with three fields" — no longer costs anything extra in the common
  case: `app/(app)/layout.tsx` is a shared layout, preserved across
  client-side navigation between its own routes, so a visitor already on
  `/dashboard` or `/collection` who presses "You" pays nothing further; only
  a first, direct load of `/settings` now pays the same collection fetch
  every other entry point into the shell already pays.

Separately, on the same visit: `CardsDashboard.tsx` had no visible page title
at all (the shell's own `<h1>` is `sr-only`, and `CardsView`'s is too, on the
reasoning that the sidebar/tab bar already say which screen you're on). Added
a visible `<h1>Dashboard</h1>`, first with ad-hoc Tailwind classes matched by
eye to `app/(app)/settings/layout.tsx`'s own new `<h1>` — close but not
identical to `.cards-main-title` (`cards.css`), the page-title style
`CardsView`'s own `<MainTitle>` already uses everywhere else in the shell
(Collection, Wishlist, one set, one era): `font-weight: 600` via Tailwind's
`font-semibold` instead of the design token `--fw-title` (`500`), and no
explicit `font-family`/`line-height`. Once asked to make Dashboard's style
consistent with the rest of the app rather than the other way round, both
headings were switched to the literal `cards-main-title` class instead of a
parallel Tailwind rebuild of it, and `SetIndex.tsx` (`/collection/sets`,
which also had no page title at all) got the same treatment — three fewer
copies of the same handful of CSS properties to keep in sync by hand.

## Related

- `docs/decisions/0012-cascade-layers-fix.md`,
  `docs/decisions/0017-cards-rail-pane-swap-fix.md`,
  `docs/decisions/0028-tabbar-desktop-hide-cascade-bug.md` — the first three
  occurrences of this cascade-layer failure mode.
- `docs/decisions/0025-profile-avatar-upload.md` — where the avatar image and
  `viewer.avatarUrl` this reuses come from.
