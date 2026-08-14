---
id: ADR-0002
title: Subtle free and European positioning
status: accepted
date: 2026-08-14
scope: repo
deciders: [Bart]
superseded-by: null
tags: [landing-page, positioning, copy]
---

# Subtle free and European positioning

## Context and problem statement

Card Orb is fully free and uses Cardmarket pricing in euros, which makes it particularly relevant to European collectors. The landing page needs to communicate these advantages accurately without positioning the product as region-exclusive or relying on a broad geographic slogan.

## Considered options

1. **Explicit regional positioning** — describe Card Orb as a European Pokémon-card platform.
2. **Subtle contextual positioning** — state that the product is free and surface euros and Cardmarket as practical collector details.
3. **No positioning change** — retain the existing generic free and price copy.

## Decision

We will state that Card Orb is free without limits and use Cardmarket and euro-price language as the signal of regional relevance.

It is chosen because it communicates the real benefit while keeping Card Orb welcoming to any collector and avoiding claims that need a geographic boundary.

## Consequences

- Good, because prospective users see the price and market context without decoding a feature tier.
- Bad, because the European focus is less immediately obvious to collectors unfamiliar with Cardmarket.
- Neutral, because no pricing model, regional restriction, or product functionality changes.

## Confirmation

Confirm that the visible landing copy says the product is free and references Cardmarket prices in euros without calling the product region-exclusive.

## Related

- Feedback: FB-0003
- Code: `app/page.tsx`
