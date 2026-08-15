---
id: ADR-0033
title: Add-card search distinguishes "failed" from "no matches", and pages instead of capping at 20
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [add-card, catalogue, search, reliability]
---

# Add-card search distinguishes "failed" from "no matches", and pages instead of capping at 20

## Context and problem statement

Bart reported searching "Charizard" in the shipped single-search-bar add-card
dialog (ADR-0031/0032) and getting no results — a query independently verified
against the live pokemontcg.io API, repeatedly, to return 100+ real prints. Live
reproduction wasn't captured (Vercel log tail came up empty across two windows;
no browser session was available this session either), but the code has a
sufficient, confirmed explanation without it: `searchCards()`
(`lib/core/ptcg-search.ts`) retried once and then returned `[]` on exhausted
retries — the identical shape a genuine zero-match search returns — and
pokemontcg.io's unauthenticated tier is measurably flaky (5 failures out of 10
rapid requests, measured directly earlier this session; a paid key/its successor
"Scrydex" was already declined as disproportionate for a single-user hobby app).
`CardAddDialog.tsx`'s search effect did the same collapse: a non-OK response and
a thrown fetch error both just cleared `matches` to `[]`. Whichever exactly
happened to Bart, this is a real gap either way, and it matters more since
ADR-0032 removed the dialog's manual-entry fallback — a search that fails
silently is now a card that silently cannot be added at all.

Separately: a broad query like "Charizard" has 100+ real prints, and the dialog
capped results at 20 with no way to see more, inside a modal that was
deliberately kept rather than becoming a separate results page/route.

## Considered options

1. **Leave `searchCards()` swallowing failures into `[]`, add a global "search
   might be down" banner instead of a precise per-search signal** — rejected:
   doesn't actually tell a specific search "this one failed," so the user still
   can't act on it (retry, know it's not their query).
2. **`searchCards()` returns a richer shape, e.g. `{ cards, failed }`, instead of
   throwing** — considered; keeps the function's contract "never rejects," but
   grows every success case into checking a flag, and adds a second way to
   express "not really a result" alongside the empty array itself.
3. **`searchCards()` throws on exhausted retries; the route answers a distinct
   `502`; the dialog tracks a dedicated `searchFailed` flag, separate from
   `matches`, with a "Try again" action** — chosen, alongside adding `page`
   support (`MAX_RESULTS` per page, pokemontcg.io's own `page` param, live-
   verified this session) and a "Show more results" button that appends rather
   than replaces `matches`, keeping the existing modal.

## Decision

`searchCards()` now retries 3 times total (was 2) and throws once exhausted,
rather than returning `[]`. `app/api/v1/catalog/search/route.ts` catches that
throw and answers `502` with `{ error: "search-unavailable" }`, distinct from the
existing `400` for "typed nothing useful." `CardAddDialog.tsx` gets a
`searchFailed` boolean (true only on a failed request, never on a genuine empty
result), rendered as "Search is temporarily unavailable." plus a "Try again"
button (bumps a `retryTick` dependency to re-run the existing debounced effect,
no new fetch plumbing). Pagination: `searchCards()`/the route/the dialog all pass
a `page` number; the dialog tracks `page`/`hasMore`/`loadingMore` and shows "Show
more results" under the grid when the last page came back full, appending
(de-duplicated by id) rather than replacing.

Chosen over option 1 because a banner can't be retried per-search and doesn't
distinguish which search failed. Chosen over option 2 because a thrown error is
the smaller, more legible change here — one failure path all the way from
`searchCards()` to the UI, rather than two shapes of "not really a result"
(`[]` for none, `{failed:true}` for broken) to keep straight at every call site.

## Consequences

- Good, because the dialog can no longer show "no results" for a search that
  never actually completed — the exact ambiguity behind the reported bug,
  confirmed-by-code even without a captured live reproduction.
- Good, because a broad query is no longer artificially capped at 20 — "Show
  more results" reaches however many prints actually exist, without a new route.
- Bad, because `searchCards()`'s contract changed from "never rejects" to
  "rejects on exhausted retries" — every caller (one route, its tests) had to be
  updated; a future caller that assumes the old contract would need to be caught
  in review, not by the type system (the return type didn't carry this).
- Neutral, because `hasMore` is an approximation (`cards.length === MAX_RESULTS`)
  — an exact multiple of 20 real matches offers one "Show more" that comes back
  empty. Accepted: the dialog treats an empty next page as "no more," not a
  failure, so the worst case is one harmless extra click.

## Confirmation

`npm run check` green (typecheck, `lib/core/ptcg-search.test.ts` extended for
the throw-on-failure and page-forwarding behavior, `route.test.ts` extended for
502-vs-400 and page forwarding, lint). Live-verified `page` against the real
pokemontcg.io API before relying on it (page 2 of a Charizard query returned
distinct results, `count`/`totalCount` as expected). Not verified against a real
signed-in browser session this session — ask Bart to search "Charizard" again
next time the dialog is open, and check whether "Search is temporarily
unavailable" now appears instead of a silent empty result if pokemontcg.io is
still flaky.

## Related

- Feedback: reported directly in conversation ("ja zoeken leverde bij charizard
  al bijv geen resultaat"), not filed as a separate FB record — the fix and its
  reasoning are fully captured here.
- Supersedes: none (extends ADR-0031/0032's implementation, doesn't reverse
  either's decision)
- Code: `lib/core/ptcg-search.ts`, `app/api/v1/catalog/search/route.ts`,
  `app/components/CardAddDialog.tsx`
