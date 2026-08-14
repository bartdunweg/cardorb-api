# 0005 — Split CardItem and Segmented out of CardsView.tsx

- Status: accepted
- Date: 2026-08-14

## Decision

`app/components/CardsView.tsx` (1,940 lines) mixed the page's whole state
machine (filters, panes, sort, incremental set-building) with two
self-contained pieces that had no dependency on any of that state:

- `CardItem` — one memoised grid/list tile, moved to
  `app/components/CardItem.tsx` along with its two exclusive helpers,
  `CardLink` and `euroShown` (neither was used anywhere else in the file).
- `Segmented` — a generic three-option control, moved to
  `app/components/Segmented.tsx`.

`CardsView.tsx` shrank 1,940 → 1,604 lines. The module-level helpers that
*are* read by the main component's hooks (`releasedIn`, `norm`, `eraYears`,
`label`, `setMeta`) stayed put — they have no other consumer.

## Why only these two

The wider survey (see `STATE.md` before this session) flagged `CardsView.tsx`
as the biggest remaining file, but most of its bulk is one component's
actual state — filters, panes, grouping, incremental rendering — which is
not extractable without changing behaviour or introducing prop-drilling that
would itself be a design decision, not a mechanical move. `CardItem` and
`Segmented` were the only two pieces with a closed, already-typed prop
interface and zero reference to any of `CardsView`'s internal state, which is
what made this a code-motion refactor rather than a redesign.

## Verification

Different from the two `lib/core` splits: this file has no component tests,
so `npm run check` alone (178 tests, typecheck, lint — all pass unchanged)
does not prove the UI still renders. Started `npm run dev` and requested
`/user/bartdunweg` (the public collection page, reachable without
credentials in this workspace): 200, the expected "not available right now"
empty state (no `NOTION_TOKEN` is configured here), and no server or
hydration error in the dev log. This confirms the split compiles, resolves
its imports, and renders through SSR without crashing — it does not exercise
the card grid, filtering, or the tilt/foil effect with real data, since this
workspace has no collection credentials. That gap is an environment
limitation, not something this refactor could verify further; note it if
picking this up somewhere with real credentials.
