---
id: ADR-0018
title: Grep the whole app before deleting CSS, not just the file you're editing
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, bug]
---

# Grep the whole app before deleting CSS, not just the file you're editing

## Context and problem statement

After migrating `CardsSidebar.tsx` and `CardItem.tsx`, a repo-wide grep for
every class name deleted from `cards.css` this session (rather than just the
files being actively edited) found five more places still using the old,
now-unstyled class names:

- `app/(app)/loading.tsx` (the `/cards` route's Suspense fallback skeleton):
  a bare `.cards-scan`, a bare `.cards-item` with no `data-view` attribute
  (so none of `CardItem.tsx`'s new `data-[view=...]:` conditional classes
  would have applied even if present), a bare `.cards-rail`, a bare
  `.cards-main`, a bare `.cards-nav`, `.cards-rail-title`, and `.page-cards`
  on the root section.
- `app/components/CardDetail.tsx`: a `<Tag className="cards-tag">` for the
  printing rarity, styled by the same rule `CardItem.tsx`'s tags used.
- `app/components/CardsView.tsx`: its own `isPublic` branch renders
  `<section className="cards-main">{main}</section>` — a second call site in
  the *same file* already being edited for this chunk, missed because the
  edit focused on the JSX region being actively read rather than every
  occurrence of the string.

None of these were caught by `npm run check` (typecheck/lint/tests all
passed) or by the earlier visual passes, which exercised `/`, `/login`,
`/user/<name>` at the outer-shell level but never triggered the loading
skeleton (no real fetch delay in this dev environment) or a card detail page
(no seeded data to click through to one).

## Considered options

1. **Trust the per-component migration to be complete once the "primary"
   file's classes are all replaced.** What actually happened for the first
   five chunks of `cards.css` — worked because `CardItem.tsx`/
   `CardsSidebar.tsx` were each the class's *only* real consumer. Broke
   silently once a class turned out to have a second, easy-to-forget
   consumer (a loading skeleton, a detail-page tag, a second branch in the
   same file).
2. **After each file's CSS deletions, `grep -rn` the exact class name(s)
   across the whole `app/` tree**, not just the directory being worked in,
   before considering the migration of that class complete.

## Decision

Option 2, going forward for the rest of the `cards.css` migration. Applied
retroactively this session: found and fixed all five call sites above by
porting the identical Tailwind classes already established for the primary
consumer (`CardItem.tsx`/`CardsSidebar.tsx`/`cardsPageClasses.ts`) rather
than re-deriving them.

The `loading.tsx` case is worth naming specifically: a Suspense fallback is
easy to forget precisely because it's never in the way during normal
development — the collection either loads fast enough not to show it, or (as
in this dev environment, with no Notion/Cards credentials) errors out before
it would ever render. A route with a loading state is a standing reason to
grep, not just read the "main" component.

## Consequences

- Good, because the fixes are mechanical — copy the already-verified
  Tailwind classes from the primary consumer — so confidence is high without
  needing to re-derive or re-verify the CSS mapping itself.
- Good, because this generalizes cleanly: after finishing any `cards.css`
  class's migration, `grep -rn '"<exact-class>"' app` before moving on,
  every time, rather than trusting "I already checked the obvious files."
- Bad, because this is the fourth class of bug found this session in the
  `cards.css` chunk alone (after the cascade-layers fix, the tabbar dead
  branch, and the pane-swap conditional-property fix) — a reminder that this
  file's blast radius is wider than any single component file suggests, and
  every remaining `cards.css` chunk should budget for this same grep step.

## Confirmation

`npm run typecheck`, `npm run test` (301 tests) and `npm run lint` all pass.
Repo-wide grep for every class name removed from `cards.css` so far, filtered
to exclude the files already known to use the new Tailwind classes, returned
clean after these fixes.

## Related

- Supersedes: none
- Related: ADR-0012, ADR-0017 (the other bugs this session's `cards.css`
  chunk surfaced)
- Code: `app/(app)/loading.tsx`, `app/components/CardDetail.tsx`,
  `app/components/CardsView.tsx`
