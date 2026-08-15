---
id: ADR-0030
title: Add-card dialog gets a live catalogue-search preview, Set moved above Name
status: superseded by ADR-0031
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: ADR-0031
tags: [add-card, catalogue, ux]
---

# Add-card dialog gets a live catalogue-search preview, Set moved above Name

## Context and problem statement

Adding a card was eight blind text fields straight into Postgres. The Name field had
no assistance at all — Set, Rarity and Gen each read from a `<datalist>` built from
values already in the collection, but Name had nothing, so there was no way to confirm
a typed name matched an actual printing until after submit. The user asked for this
directly: they want to see the card they're searching for, small, as they type the
Pokémon name.

`GET /api/v1/catalog/search?set=&query=` already existed for exactly this — it returns
`{ id, number, name, setName, image, imageHigh }` for name/number matches inside one
set, is authenticated, and is unit-tested — but nothing in the client called it
(`grep -rn "catalog/search"` across `app/**` returned no hits outside the route and its
own test). It was built in the per-variant-inventory-fields commit and never wired up.

The route is deliberately scoped to one set at a time; its own comment explains that a
global cross-set search would mean fetching every TCGdex set, uncached, on every
keystroke. The old field order put Name first and Set third, so a name-first live
search would either have to violate that scoping or search nothing until Set was also
filled in, arriving in an order the form didn't ask for.

## Considered options

1. **Global cross-set search, keep field order as-is** — search across every set as
   the name is typed, only using `set` to narrow if already filled.
2. **Auto-fill the row from the single best-scoring match** — skip the click, write
   the row straight from whatever the search's top result is once a name is typed.
3. **Reorder Set above Name, live-search scoped to the chosen set once both are
   present, and require a click to accept a match** — chosen.

## Decision

We will move the Set field above Name in `CardAddDialog.tsx`, and add a debounced
(250ms) fetch to the existing `/api/v1/catalog/search` route once both `set` and a
2+ character `name` are typed. Matches render as a small clickable thumbnail strip
under Name; clicking one fills `number` and normalizes `name`, and highlights that
thumbnail until a further edit to `name`/`number` clears the highlight.

Chosen because it respects two decisions already on record rather than reopening
them: the search route's own scoping rationale (option 1 would mean either fetching
every set per keystroke or building a second, more expensive endpoint), and
ADR-0022's "a wrong scan is worse than a missing one" (option 2 would silently write
artwork nobody confirmed, the exact failure mode ADR-0022 spent an audit tracking
down and explicitly rejected doing name-first). Reordering the fields is a one-line
cost that turns "search needs a set" from a hidden constraint into the shape of the
form.

## Consequences

- Good, because the Name field goes from zero assistance to a live, clickable
  confirmation, using an endpoint that already existed, was tested, and cost nothing
  new to build.
- Good, because Number gets filled correctly (zero-padded, exact) from a click
  instead of typed by hand, which is also what the artwork lookup needs to find a
  scan on the first try.
- Bad, because the live preview does nothing until Set is filled in, which is a
  behavior change from "Name first" — someone who skips Set (it wasn't required to
  *reach* Name before, though it was always required to submit) sees no preview and
  may not immediately know why.
- Neutral, because this only touches `app/components/CardAddDialog.tsx`; the route,
  its auth, and its tests were already in place and are unchanged.

## Confirmation

`npm run check` (typecheck + test + lint) passes with the new debounce effect and
thumbnail strip. Manual verification of the actual click-to-fill flow needs an
authenticated session (per ADR-0020, this dialog is easy to miss without one) and
wasn't done in this session — the browser automation tool wasn't connected and the
production passcode wasn't available. Confirm by hand next time the dialog is open:
type a known set, then a partial name, and check thumbnails appear and clicking one
fills Number and highlights.

## Related

- Code: `app/components/CardAddDialog.tsx`, `app/api/v1/catalog/search/route.ts`
- Supersedes: none
- See also: ADR-0022 (gallery-artwork-via-pokemontcg, the "wrong is worse than
  missing" rule this mirrors), ADR-0020 (card-add-input-styling-regression, the
  same dialog's manual-QA caution)
