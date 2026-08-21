---
id: ADR-0075
title: The chart library followed a dead branch onto five routes, and Suspense alone does not make a page static
status: accepted
date: 2026-08-21
scope: repo
deciders: [Claude, on a full-repository performance review]
superseded-by: null
tags: [performance, bundle, next-js, rendering]
---

# The chart library followed a dead branch onto five routes, and Suspense alone does not make a page static

## Context and problem statement

A performance review measured the built app and production together. Two of its
findings are acted on here; two are deliberately left open and one of those was
attempted and reverted.

**`recharts` shipped to five routes that draw no chart.** One static import at
`CardsView.tsx:19` — `CardsDashboard` → `CollectionValueCard` → `recharts` —
put a 165.8 kB gzipped chunk on `/collection`, `/wishlist`,
`/collection/set/[slug]`, `/collection/era/[slug]` and `/user/[username]`. Only
`/dashboard`, which reaches `CardsDashboard` by a different path, renders a
chart. On the live public profile that chunk was **34% of the 492 kB of JS and
CSS the page downloads** — and it is the one page in this app a stranger on a
phone actually lands on.

The branch consuming it was already documented as unreachable, in its own
comment. That is not evidence, so it was proved instead.

**`/` and `/app/ios` were uncacheable for one navbar pill.** Both awaited
`currentViewer()` at the top of the page component, which reads cookies. Measured
against production: `/privacy` served from the CDN with `age: 7213` and a TTFB of
78–126 ms; `/` and `/app/ios` returned `private, no-cache, no-store` with a cache
MISS every time, at 154–193 ms. Neither declares `dynamic = "force-dynamic"` —
they were dynamic by consequence, which is the kind of cost nobody chose.

## Decision

**The dead branch is deleted, not lazily loaded.** `dynamic()` would have hidden
the chunk while leaving unreachable code in a file already too long. Proved dead
before deleting, three ways: every `scope` any caller passes is `all`,
`wishlist`, `era:*` or a set name and never `dashboard`; the public variant sets
`onDashboard` false regardless of scope; and the legacy `/cards` route is a
redirect, not a second caller. The now-orphaned `stats` memo — a walk over
sixteen hundred cards on every render — went with it, since the deleted branch
was its only reader.

**Measured: `/user/[username]` went from 285.3 kB to 162.8 kB of gzipped route
JS, and the recharts chunk is now named by exactly one route manifest,
`/dashboard`.** The repo-wide total went 604.3 → 609.8 kB because chunking
redistributed; per-route is the number that describes what a visitor downloads,
and it is the one to quote.

**The viewer read moved into `components/custom/MarketingViewerSlot.tsx` behind a
`<Suspense>` boundary — and this does not fix the caching, which is stated in
the file rather than implied.** On Next 16 without Cache Components enabled, a
`cookies()` read anywhere in the tree makes the whole route dynamic; Suspense
carves out no static shell on its own. Verified after the change: the build still
marks `/app/ios` `ƒ`, and neither route appears in
`.next/prerender-manifest.json`.

The component was kept regardless, for a smaller reason that stands on its own:
the same fourteen lines of navbar JSX were written out twice and free to
disagree, and whenever the caching fix does happen it is now one edit rather than
three.

## Alternatives considered

- **`dynamic()` on `CollectionValueCard` instead of deleting the branch.** The
  cheapest correct change, and rejected: it leaves provably unreachable code in a
  1,767-line file and makes the next reader prove it again.
- **Enabling `cacheComponents` now, to finish the caching fix.** Rejected as out
  of scope, not as wrong. It is a project-wide migration with its own adoption
  skill, it replaces the `dynamic`/`revalidate` route configs this app uses in
  several places, and it would have to reckon with the two routes that are
  `force-dynamic` for real, recorded reasons (`app/user/[username]/page.tsx`,
  `app/(app)/layout.tsx`). Doing it at the end of a long session, on the two
  pages that are the app's front door, is how a subtle regression ships.
- **Reverting `MarketingViewerSlot` once it turned out not to deliver.**
  Rejected: the de-duplication is a real if small improvement and the analysis is
  worth keeping where the code is. Reverting would have thrown away the finding
  along with the attempt.

## Deliberately not done

- **Omitting the eleven always-null variant keys from the public payload.**
  Measured at 472.3 kB of the 1,050 kB RSC flight payload — 45% of it. Attempted,
  and reverted, because **the premise was wrong**: `CardsView` does read one of
  those fields, transitively. `shownPrice()` → `variantPrice()` branches on
  `variant.finish === "reverse-holo"`. Narrowing the public variant to two fields
  therefore breaks nine call sites inside `CardsView.tsx`. The right home for it
  is that file's own refactor, with `variantPrice()` taking an optional finish.
  One thing was kept from the attempt: `cards-public.test.ts` now asserts the
  allow-list as a whole — every non-null key equals exactly `rarity` and `owned`
  — instead of one field at a time, which is the assertion that will fail when a
  thirteenth field is spread in by habit.
- **Collapsing the six repeated Tailwind class strings on the public profile.**
  4.55 MB of that page's 6.24 MB of HTML is `class` attributes; one 1,346-character
  string appears 1,610 times. Collapsing them measured 6.24 → 2.07 MB. Left open:
  it is a real design change to `cardsPageClasses.ts` and `CardItem.tsx` and
  belongs with the same refactor.

## Consequences

- `/dashboard` is the only route carrying recharts, which is what it is for.
- `CardsView.tsx` lost its `CardsDashboard` import, the `stats` memo and the
  branch. `onDashboard` survives and is now provably always false, gating five
  other layout decisions harmlessly — dead code, and named as such for the
  refactor rather than half-removed here.
- **A stale comment was corrected on the way out.** `CardsView.tsx` claimed the
  public route is static and so rendering all 1,610 tiles "costs once, in
  prerender". It is `force-dynamic`, so that cost is per request. Whether to keep
  rendering every tile is still open; the comment is no longer what hides the
  question.

## Related

- `docs/decisions/0014-cache-assembled-collection.md` — the caching this review
  checked and did not touch.
- `docs/decisions/0038-browse-scans-come-from-tcgdex.md` — why `next/image` is
  deliberately not used here, re-verified this pass.
- `docs/decisions/0045-public-collection-carries-two-variant-fields.md` — the
  allow-list whose serialised shape is the open item above.
