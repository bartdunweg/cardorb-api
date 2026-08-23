# App shell & Settings redesign — design

Bold rebuild of the signed-in `(app)` shell and the Settings screen onto Untitled UI,
keeping all functionality identical. Direction chosen by the owner: option **B** — the
boldest of three; shell identity may give way, product identity (card holo + tilt) does not.

Status: design approved in chat, section by section. This document is the reference for the
implementation plan. Nothing has been built yet.

## Goal

- Rebuild the **desktop rail** and the **Settings** screen onto Untitled UI's structure.
- Keep every behaviour identical: navigation, selection, counts, add-card, search, filters,
  and every Settings action.
- Do it on its own branch, in verifiable phases, with `./scripts/verify.sh` green at each step.

## Hard constraints — must not break (from the shell architecture map)

These are functional contracts. Breaking one is a regression, not a redesign choice.

- **The `<main id="main-content">` DOM-sibling contract.** `AppShell` renders, as literal
  siblings: `sr-only <h1> → rail → <main id="main-content"> → tab bar → CardAddDialog`. The rail
  must stay a **sibling** of `<main>`, never an ancestor — the card grid depends on the CSS
  sibling selector `.cards-rail[data-pane] + .cards-main` and on `.cards-main`'s
  `container-type: inline-size`. Wrapping either element breaks the grid.
- **R-PLAT-003** — exactly one `<main id="main-content">` per screen, after navigation. Enforced by
  `src/app/main-landmark.test.ts`; its `DRAWN_BY` map must be updated if any route's `<main>`-drawing
  file changes.
- **R-PLAT-004** — `(app)/loading.tsx` covers all seven routes; it may only draw what is true of all
  of them (a breathing orb + one sr-only `<h1>`, its own standalone `<main>`). Do not change loading
  behaviour as a side effect of a chrome redesign.
- **RSC boundary (the bug that already bit us).** A Server Component may not render an interactive /
  compound Untitled component directly: a compound object exported from a `"use client"` module is a
  client reference on the server, and member access (`X.Root`) is `undefined` → "Element type is
  invalid" at request time (missed by `next build` because these routes are `force-dynamic`). Every
  Untitled-backed component is rendered from a `"use client"` file; server pages fetch data and pass
  serializable props down.
- **Auth & onboarding order** — `layout.tsx` gates with `currentViewer()` → `redirect("/login")`,
  then `redirect("/welcome")` if not onboarded, **before** the collection fetch. Order preserved.
- **Shared rail/tab bar.** `CardsSidebar` and `CardsTabBar` are used by both the owner shell (via the
  thin `AppSidebar`/`AppTabBar` router adapters) and the public `/user/<name>` page (directly, with
  no router — it uses `pane`/`openPane`/`backToRail`/`selectedState`). Rebuilding their chrome must
  keep the public page's client-side pane behaviour working.
- **Set-as-navigation, not set-as-facet.** Sets are navigation (`onSelect` → `router.push`), a
  deliberate past decision. Do not regress to a checkbox filter list.
- **CollectionContext** must keep wrapping `<main>` and its siblings; `useCollection()` throws
  outside the provider.
- **`variant: "owner" | "public"`** on `CardsView` is the single source of owner-vs-public
  divergence. Do not reintroduce the old three-flag design.
- **The global CardAddDialog** lives once in `AppShell`; screens call `onAdd()` from context.

## Section A — Shell structure (approved)

**Preserved:** the sibling DOM contract above; set-list-by-era with sticky pressable era headings;
per-row logo with 404→PNG retry then blank fallback; per-set counts; the fixed rows
(Dashboard / Collection / Wishlist / Profile / Sets / Browse) with their exact visibility rules;
`onAdd`; `onSelect`; the bottom avatar footer; the responsive rail-as-screen-below-1000px behaviour.

**Rebuilt onto Untitled (identity may give way here):**
- The **desktop rail internals** move onto Untitled's `SidebarNavigation` container + `NavItem` rows
  + account card, wrapped so behaviour is ours: a row is icon/logo + label + count-as-badge; eras are
  section headings; `onSelect` still drives `router.push` (owner) / pane state (public).
- **The sliding hover/active pill is dropped** in favour of Untitled's own active treatment (filled
  background). This is the shell identity that gives way.
- Built entirely client-side; the rail stays a sibling of `<main>`.

**Mobile: the bespoke bottom tab bar stays** (owner decision). Untitled has no bottom-tab-bar
component; the `CardsTabBar` and its `useSlidingPill` math are unchanged. Only the desktop rail is
rebuilt.

## Section B — Settings structure (approved)

**Preserved:** each field/panel saves on its own (no single Save button); CSV preview→commit
two-step; typed-username delete confirmation; the optimistic public-link toggle with revert;
`router.refresh()` after saves; `settings/page.tsx` stays a Server Component reading `ownProfile` +
`recentImports`; the five `*Settings.tsx` leaves stay client.

**Rebuilt onto Untitled:**
- **Layout: one refined scroll** — all five groups on one page (as today), not tabs, not a second
  nav column (the shell already has the rail; a second settings nav would be two side-by-side navs).
- Each group headed by Untitled's `SectionHeader`, rendered **client-side** (in the client leaves or a
  client wrapper) — this is the correct fix for the RSC crash that reverting undid.
- **Group descriptions** filled (the `Subheading` slot). Copy proposed by the assistant, approved by
  the owner before it lands.
- Panels/forms tightened onto Untitled's form rhythm, consistent across all five groups.
- **Accessibility fixes** from the interface review folded in:
  - `aria-live` on every save/error result (`role="status"` for success, `role="alert"` for errors) —
    always-mounted regions, not conditionally inserted.
  - A redundant (non-colour) selected cue on the Appearance mode cards.
  - The Import result line moved inside a panel instead of floating as a bare grid cell.

## Section C — Visual language (approved; density decided by default)

- **Identity boundary:** the card **holo shine and tilt stay** (R-STYLE-007) — that is the product's
  identity and lives on the cards, not the shell. Only shell chrome (the rail pill) gives way.
- **Tokens:** every value stays in `src/styles/theme.css` (R-STYLE-001). Untitled's values are mapped
  onto Card Orb tokens; where they are equivalent, take Untitled's (R-STYLE-006). Dark mode stays via
  `light-dark()`. `bg-secondary` = page, `bg-primary` = raised (R-STYLE-017).
- **Density (assumption, not a chosen answer — owner cancelled the question):** keep the current
  roomier rhythm and only make it tidier; no jarring density change. Flag at spec review if the owner
  wants tighter, more dashboard-like density instead.

## Build sequence (phased, each phase ends green)

Own branch, off `main`. Each phase runs `./scripts/verify.sh` and is confirmed in the real app
(behind auth) before the next.

1. **Vendor + client-boundary groundwork.** Re-vendor `section-headers` and vendor
   `sidebar-navigation-base` via `npm run ui:add`. Confirm every consumer will be a client component.
2. **Settings first** (smaller, self-contained, lower risk; leaves are already client): section
   headers client-side, descriptions, the three a11y fixes, form rhythm. Verify /settings renders
   behind auth (the exact check the section-headers crash needed).
3. **Desktop rail** onto Untitled `SidebarNavigation`, keeping the sibling DOM contract and every
   behaviour; update `main-landmark.test.ts` only if a `<main>`-drawing file changes (it should not).
   Verify owner shell and the public `/user/<name>` page both still work.
4. **Visual pass** — tidy spacing/type/surfaces within the token system; confirm contrast tests still
   pass; confirm holo/tilt untouched.
5. **Changelog + rules.** User-visible → `changelog.d/` fragments. If any adoption sets a new norm,
   record a rule via `record-rule`. Update `STATE.md`.

## Out of scope / deferred

- Mobile navigation pattern change (bottom bar stays bespoke).
- Two-column / tabbed settings.
- Any change to loading/streaming behaviour (R-PLAT-004's documented future work).
- Any change to card holo/tilt.
- The pane-selector semantics of the public page (kept intact).

## Open question for the owner at spec review

- Density: keep roomier-but-tidier (assumed), or go tighter/dashboard-like?
