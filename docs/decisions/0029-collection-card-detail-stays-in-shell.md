---
id: ADR-0029
title: A card opened from /collection stays inside the (app) shell, as a real page
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [collection, routing, navigation]
---

# A card opened from /collection stays inside the (app) shell, as a real page

## Context and problem statement

`/cards` (the grid) is a redirect to `/collection` now — the owner-facing
collection UI lives entirely under `(app)/collection/*`, in its own shell
(`AppShell.tsx`: sidebar + navbar persist across every screen). `/cards/[id]`
(the detail page) and its intercepted modal (`app/@modal/(.)cards/[id]`),
though, were never moved: `CardItem.tsx`'s `CardLink` still hard-linked every
card to `/cards/${id}`. Clicking a card anywhere in `/collection` worked, but
landed outside the shell entirely — no sidebar, no navbar, a full page swap
to a route the rest of the product no longer routes through.

Bart: "misschien moet op desktop in ieder geval de detail page van een card
ook echt een page gewoon zijn" — investigation found the new architecture
had no card-detail route of its own at all, just this fallthrough to the old
one.

## Considered options

1. **Leave it linking to `/cards/[id]`.** Rejected — that page is explicitly
   documented as "untouched" for backward-compatible bookmarks/old links, not
   as the collection's own detail screen, and it exits the shell.
2. **Reuse `/cards/[id]`'s intercepted modal for `/collection` too**, by
   adding a second interceptor at the `/collection` segment level. Rejected:
   Next.js route interception (`(.)`) only catches navigations from routes at
   the *same* segment level as the intercepting route, so a second
   interceptor would need its own directory under `(app)/collection/`
   anyway — at which point it is exactly as much work as a real page, for a
   dialog-preserves-scroll behaviour nobody asked for here. Bart's own
   wording ("echt een page") pointed at a real page, not a dialog.
3. **A new page route under `(app)/collection/`**, so it renders as
   `children` inside the existing `AppShell`/sidebar/navbar the same way
   every other collection screen does. Chosen.

## Decision

`app/(app)/collection/card/[id]/page.tsx` — a near-verbatim copy of
`/cards/[id]/page.tsx`'s data-fetching (`currentViewer()`, `owned()`,
`getCardDetail()`, `cardNeighbours()`, `generateMetadata`), rendering the
same `CardDetail` component. `/cards/[id]` itself is untouched — an old
bookmark or shared link still resolves.

Two components gained an optional `basePath` prop (default `/cards`, so
every other caller is unaffected):
- `CardNav.tsx` — its prev/next links and arrow-key/swipe handlers all
  built `/cards/${id}` directly; now `${basePath}/${id}`.
- `CardItem.tsx` (`CardLink`) → threaded up through `CardsView.tsx` →
  `CollectionScreen.tsx`, which is the one caller that passes
  `basePath="/collection/card"`. `CardsView`'s public-collection variant
  (`app/user/[username]`) and the untouched `/cards/[id]`'s own callers all
  keep the default.

## Consequences

- Good: a card opened from `/collection` (any set, era, or the top-level
  grid) now stays inside the shell — sidebar and navbar visible, "Sets" row
  still highlighted correctly (ADR-0027's fix already covers this, since
  the URL is still under `/collection`).
- Good: no behaviour change for the old `/cards/[id]` page or its modal —
  same component, same data, default `basePath`.
- Neutral: `/collection/card/[id]` has no modal/interception at all, on any
  width — a plain page every time, which is what was asked for. If a
  filter/scroll-preserving dialog is wanted here later, that is a genuinely
  separate ask (an interceptor scoped to `(app)/collection/`), not something
  this change rules out.
- Neutral: the public collection (`app/user/[username]`) is untouched — it
  already uses a client-side dialog (`PublicCardDialog`, no URL at all) via
  `onPick`, a third pattern that existed before this change and isn't what
  Bart asked about.

## Confirmation

`npm run typecheck && npm run test && npm run lint` green.
`curl -i http://localhost:.../collection/card/<id>` (signed out) redirects to
`/login?next=/collection/card/<id>` correctly. Not exercised signed in with
real data in this workspace (no live browser session available here) — worth
a real click-through before considering this fully verified.

## Related

- `app/cards/[id]/page.tsx`'s own comment: "/cards/[id] is untouched."
- `app/cards/page.tsx` — the grid's redirect to `/collection`, the earlier
  step in the same migration this completes for the detail screen.
