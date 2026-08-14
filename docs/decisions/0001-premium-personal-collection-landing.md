---
id: ADR-0001
title: Premium personal-collection landing
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [landing-page, product-positioning]
---

# Premium personal-collection landing

## Context and problem statement

Card Orb has open signup and opt-in public collection links, but its homepage only contains a short hero and three feature cards. The product needs a more complete landing experience without suggesting that it is a collector community, marketplace, or social network.

## Considered options

1. **Community-platform positioning** — focus on discovery and social collector features.
2. **Premium personal-collection positioning** — focus on a collector's private workflow with optional public sharing.
3. **Minimal product introduction** — retain the current sparse hero and feature list.

## Decision

We will build a premium personal-collection landing page that uses an authentic static preview of the public collection as product proof.

It is chosen because it matches the actual product: collectors can organise, value, and share their own collection, but cannot yet discover, follow, trade with, or interact with other collectors.

## Consequences

- Good, because the page has a clearer product story and stronger evidence for sign-up.
- Bad, because the preview needs a curated asset when the public collection design changes.
- Neutral, because no public APIs, schema, or community features are added.

## Confirmation

Confirm that the implemented landing accurately describes existing functionality, that its preview links to the public collection, and that it passes the repository's build and quality checks.

## Related

- Feedback: FB-0001
- Code: `app/page.tsx`
