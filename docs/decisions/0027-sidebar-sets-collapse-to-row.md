---
id: ADR-0027
title: The signed-in rail collapses its inline set list to one "Sets" row
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [sidebar, collection, navigation]
---

# The signed-in rail collapses its inline set list to one "Sets" row

## Context and problem statement

`CardsSidebar.tsx` renders every set the collection has, grouped by era, as
one long scrollable run — fifty-plus sets, each a clickable row with a logo
and a count. That was the rail's original and, at the time, only way to
reach a set (`CardsSidebar.tsx`'s own comment: "the sets are navigation
rather than a facet").

Since then, `/collection/sets` (`SetIndex.tsx`) was built as exactly that
same list, as a real page — "linkable, survives refresh, reachable at every
width," per its own comment. Nothing had gone back to simplify the rail once
that page existed: `AppSidebar.tsx` (the `(app)/collection/*` routes' rail)
still rendered the full inline era list on every request, so the two existed
side by side, one inside the other's screen. Bart: "kunnen we die sets als
een soort view maken op my collection? zodat het uit de sidebar kan?" — not
realising the view already existed; the ask was really "stop duplicating it
in the rail."

## Considered options

1. **Remove the inline list from `CardsSidebar.tsx` entirely.** Rejected:
   the component is shared with the legacy `/cards` route
   (`CardsView.tsx`), which has no `/collection/sets` equivalent and still
   depends on the full inline list for its own pane-swap navigation model.
   Removing it there would be a regression, not a simplification.
2. **Fork a second sidebar component for `(app)/collection/*`.** Rejected —
   the component's own comment already explains why `CardsSidebar` is
   *not* forked for `/fifa`, a genuinely different product; forking it for
   two views of the same product repeats the drift problem on a shorter
   timescale.
3. **An opt-in prop that collapses the list to one row**, default off.
   Chosen.

## Decision

`CardsSidebar.tsx` gained `setsAsRow?: boolean` (default `false`). When
true, the era-grouped `setGroups.map(...)` block is replaced by a single
`NavItem` — "Sets", the total set count, the same `Layers` icon the "My
collection" row already uses — wired through the existing `onSelect`
vocabulary rather than a raw `href`, consistent with how "dashboard" /
"wishlist" / "profile" already work as sentinel values `AppSidebar.tsx`
translates to routes.

`AppSidebar.tsx` passes `setsAsRow`, and its `go()`/`selectedFrom()`
functions gained a `"sets"` case: `go("sets")` pushes `/collection/sets`;
`selectedFrom()` returns `"sets"` when the path starts with
`/collection/sets`, so the row highlights correctly on that page.

The legacy `/cards` route (`CardsView.tsx` → `CardsSidebar` directly, no
`AppSidebar` wrapper) passes nothing for `setsAsRow` and keeps the full
inline list, unchanged.

## Consequences

- Good: `/collection/*` rail is now four fixed rows (Dashboard, My
  collection, Wishlist, Sets) plus Profile, not four rows plus fifty-one —
  and the full list still exists, one click away, as a real page rather
  than lost.
- Good: zero risk to the legacy route — the prop defaults to preserving
  exactly its current behaviour, and nothing about `CardsSidebar`'s existing
  props or their meaning changed.
- Neutral: `selected` for the collapsed row is the literal string `"sets"`,
  which was previously unused vocabulary in this component (era selections
  are `era:<name>`, set selections are the set's own name) — chosen to
  avoid colliding with any real set or era name.

## Confirmation

`npm run check` green.

## Related

- `app/components/SetIndex.tsx` — the page this row now points at, and
  whose existence is the actual reason the rail's own copy was redundant.
