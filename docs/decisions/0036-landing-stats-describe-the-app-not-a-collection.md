---
id: ADR-0036
title: The landing page's numbers describe the app, not the owner's collection
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [landing, copy, positioning, multi-user]
---

# The landing page's numbers describe the app, not the owner's collection

## Context and problem statement

ADR-0034 deleted `OWNER_NAME` and `PUBLIC_USERNAME`, so no account is *the*
public one any more. The landing page had not caught up: it still read as one
person's collection with a signup attached (FB-0008).

Most of that was plain copy with one obvious fix. One line was a real choice —
`STATS[0]`, "**1,600+** cards tracked". It is the size of the deployment
owner's binder, sitting in a row of product facts next to "3 catalogues
matched" and "Cardmarket, live pricing". A visitor reads it as a claim about
Card Orb; it is a claim about Bart.

## Considered options

1. **Keep it, relabelled as "cards in the biggest collection"** — honest, and
   still an invitation to compare yourself to the owner's binder on the front
   page. It keeps a privileged collection, which is the thing being removed.
2. **Make it live — the real total across every collection** — the most honest
   version and the worst one to ship: it is a query on every landing render for
   a number that, on a young multi-user app, is small enough to read as "nobody
   is here". A stat that discourages signup is worse than no stat.
3. **Replace it with a fact about the app: "No limit / cards per collection"** —
   chosen. It is true (there is no card limit and no paid tier — the FAQ says
   the same thing directly), it belongs in a row of product facts, and it
   describes what a new account gets rather than what an old one has.
4. **Drop the row to two stats** — rejected: three balanced items is a layout,
   and two leaves a gap the design does not want.

## Decision

`STATS[0]` is "No limit / cards per collection". The two FAQ entries that
implied a demo were rewritten in the same pass, and the navbar's "Public
collections" — plural, suggesting a directory that does not exist — became
"Sharing", matching the eyebrow of the section it jumps to.

## Consequences

- Good, because every number on the page is now a fact about the product, true
  for the next person who signs up as much as for the first.
- Good, because the page no longer implies a canonical collection to look at,
  which is what FB-0008 asked for.
- Bad, because the page lost its only piece of evidence that a real, large
  collection is being kept in this thing. "1,600+" was doing quiet credibility
  work. If that is missed, option 2 (a live total across public collections,
  cached) is the version to build — not the owner's number brought back.
- Neutral, because "No limit" is a promise: a card cap could not be introduced
  later without this line becoming false.

## Confirmation

`npm run check` and `npm run build` green. The landing page is the one route
this touches and it renders signed out, so it was checked live rather than
inferred.

## Related

- Feedback: FB-0008 (`docs/feedback/0008-there-is-no-demo-collection.md`)
- Builds on: ADR-0034 (`0034-collection-named-after-its-owner.md`)
- Code: `app/page.tsx`
