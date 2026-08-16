---
id: FB-0008
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 2
sentiment: neutral
status: addressed
tags: [landing, copy, multi-user, positioning]
---

# There is no demo collection — one collection happens to be public, that is all

## What was said

> "Er moet geen public collection zijn, trouwens. Mijn collectie is toevallig
> public, maar er is niet meer een soort van een demo publication. Snap je wat
> ik bedoel?"

English: "There shouldn't be a public collection, by the way. My collection
happens to be public, but there isn't a kind of demo publication any more. Do
you understand what I mean?"

## Context

Said while the settings work was being merged, immediately after ADR-0034
deleted `OWNER_NAME` and `PUBLIC_USERNAME` — the env vars that made one account
*the* public one. The code half was therefore already done; what was left was
the landing page still talking as though a showcase collection existed:

- `FAQ`: "Can I track my own collection **too**?" answered with "everything from
  here on tracks your cards, not **the demo's**."
- `FAQ`: "Is **this collection** really free to use?" — the page asking about
  itself as a collection rather than as an app.
- The navbar's "Public collections", plural, pointing at a section about
  turning your own link on. There is no directory of public collections.
- `STATS`: "1,600+ cards tracked" — the size of Bart's binder, printed as a
  product number.

## Interpretation

Not a request to remove public collections as a feature: his collection is
public and stays public. The thing to remove is the *concept* of a demo — a
canonical collection the site is built around and shows off, with everyone
else's as a secondary case. Every collection belongs to whoever made it; some
are public because their owner turned the link on.

"Snap je wat ik bedoel?" was checking the distinction landed, and it is the
distinction: same feature, no privileged instance.

## Action

- [x] The two FAQ entries rewritten — the demo sentence is gone and "Can I
      track my own collection too?" became a question people actually have
      ("Can other people see my cards?").
- [x] Navbar "Public collections" → "Sharing".
- [x] The owner-derived "1,600+ cards tracked" stat replaced with "No limit /
      cards per collection". See ADR-0036.

## Related

- Decision: ADR-0036
- Builds on: ADR-0034 (`decisions/0034-collection-named-after-its-owner.md`),
  which removed the code-level version of the same assumption
- Changelog: `docs/changelog.d/2026-08-16-no-demo-collection.md`
- Code: `app/page.tsx`
