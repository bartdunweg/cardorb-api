---
id: ADR-0023
title: The landing page and login stop linking to the public collection
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [landing, positioning, privacy]
---

# The landing page and login stop linking to the public collection

## Context and problem statement

`app/page.tsx` originally treated the owner's own public collection
(`/user/{PUBLIC_USERNAME}`) as the landing page's proof: a hero preview card
built around it, a "See how a public collection looks" link in the share
section, a footer link, and `/login`'s "Public demo" button all pointed at it.
This was deliberate at the time (`docs/decisions/0001-premium-personal-collection-landing.md`
chose a *real, static preview* over a generic mockup as the landing page's
proof of the product).

Across this session Bart asked, explicitly and more than once, to remove
every entry point to the public collection from the marketing surfaces
("geen ingangen meer naar een publieke collectie").

## Considered options

1. **Keep the links, swap the target** (e.g. a synthetic demo account
   instead of the real one). Not raised as an option by Bart and not pursued
   — it reintroduces exactly the thing being removed, one layer removed.
2. **Remove the promotional links, keep the route.** Chosen.

## Decision

`/user/[username]` stays a real, working feature (public collections are
still something a signed-up collector can turn on — the "share" section on
the landing page still describes it). What changed is that the landing page
and `/login` no longer *point* anyone at the owner's specific one:

- Landing hero: the two-column layout with a value card linking to the demo
  was tried and then explicitly reverted back to a single centred column —
  Bart: "die visual aan de rechterkant... mag wel gewoon weer weg."
- Landing share section: the "See how a public collection looks" CTA link
  removed; the section still explains the sharing feature in prose.
- Landing footer: the "Explore {OWNER_NAME}'s collection" link removed.
- `/login`: the "Public demo" button and the `SigninOr` divider it needed
  removed.
- The FAQ entry "Whose collection is this?" (which existed only to explain
  the demo link) removed as a result — asking whose collection it is no
  longer has an on-page antecedent.

## Consequences

- Good: the landing page no longer implies "go look at Bart's cards" is part
  of evaluating the product — consistent with ADR-0001's "premium personal
  collection" framing, arguably more consistent than the original version
  was, since a stranger's real collection is a community/social signal in a
  way ADR-0001 otherwise avoided.
- Neutral: `PUBLIC_USERNAME`/`DEMO_HREF` are gone from `app/page.tsx` and
  `app/login/page.tsx`; `lib/core/config.ts`'s `PUBLIC_USERNAME` export is
  unchanged (still used by `/user/[username]`'s own `generateStaticParams`).
- Bad, minor: the public-collection feature now has no discovery path from
  the marketing site at all — someone has to already know the URL shape or
  find it through a signed-up user who shares their own link. Not raised as
  a concern by Bart; noted here in case it needs revisiting.

## Confirmation

`npm run typecheck && npm run test && npm run lint` green after each removal
pass in this session.

## Related

- `docs/decisions/0001-premium-personal-collection-landing.md` — the original
  choice to build the hero around a real preview; this narrows where that
  preview is allowed to be linked from, not whether it exists.
