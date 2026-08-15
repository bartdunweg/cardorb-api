---
id: FB-0004
date: 2026-08-15
source: Bart
source-type: stakeholder
severity: 3
sentiment: neutral
status: addressed
tags: [public-api, artwork, data-quality]
---

# A public API key for the portfolio site, and an expectation that every card has artwork.

## What was said

> Kan je zorgen dat er een public API-key komt, een publiek, zodat ik bijvoorbeeld op mijn
> website de laatste pool kan ophalen en die kan tonen? Tenzij jij een betere manier weet

> Can you make sure there is a public API key, a public one, so that I can for example
> fetch the latest pull on my website and show it? Unless you know a better way.

And, asked what the endpoint should do when the newest card has no artwork:

> Alle kaarten moeten uiteindelijk gewoon artwork hebben

> All cards should simply have artwork, eventually.

## Context

The portfolio site (bartdunweg.com, outside this repo) wants to show the most recently
pulled card. `/api/v1/public/[username]/latest-pull` already existed for exactly this
(ADR-0014), already had no key, and already sent `Access-Control-Allow-Origin: *`.

## Interpretation

Two things, and the "unless you know a better way" invited the first to be answered with
a no.

The key was a means, not the goal: the goal was "my site can read this". No key was
needed, and adding one would have been worse than nothing — a key in a public site's
JavaScript is readable by anyone, so it buys no access control and costs an env var kept
in sync across two repos.

The second is a standing expectation about the collection rather than about this endpoint:
a blank card frame is a defect wherever it appears, and the answer to "what should the API
do when a card has no picture" is "make sure it has a picture". Read that way it is a
mandate to go and find the missing artwork, not to teach the endpoint to hide it — which
is why the endpoint still reports `image: null` truthfully and the artwork was chased
separately.

## Action

- [x] Explain why no API key, and document the existing endpoint in `README.md` with a
      copy-paste snippet and the nullable fields a consumer gets wrong first.
- [x] Fix the endpoint's actual defect: it was answering with a wishlist card, because
      `latestPull()` never gated on `owned` (ADR-0021).
- [x] Audit the artwork gap it exposed: 26 owned cards with no scan, 23 of them Trainer
      Gallery cards. Route gallery numbers to pokemontcg.io, guarded by a name check so a
      wrong row cannot produce a wrong picture (ADR-0022).
- [x] Report back that the remaining 23 are a data problem, with the row-by-row
      corrections in `docs/trainer-gallery-row-corrections.md`.

## Related

- Decisions: ADR-0021, ADR-0022
- Changelog: `docs/changelog.d/2026-08-15-latest-pull-owned-only.md`,
  `docs/changelog.d/2026-08-15-gallery-artwork-fallback.md`
