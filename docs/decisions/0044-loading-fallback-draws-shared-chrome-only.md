---
id: ADR-0044
title: The (app) loading fallback draws shared chrome only, never a page's shape
status: accepted
date: 2026-08-16
scope: repo
deciders: [Bart]
superseded-by: null
tags: [loading, suspense, skeleton, app-shell, tabbar, sidebar, drift]
---

# The (app) loading fallback draws shared chrome only, never a page's shape

## Context and problem statement

`app/(app)/loading.tsx` was reported as showing *"a skeleton, but of an interface
I don't recognise"* (FB-0010). It was.

The file was written for the old single-page `/cards` route, where drawing that
page's frame was the right thing to do: the rail, the heading, the toolbar, and
outlines wherever the shape had to come from the catalogue. Its own docblock said
so, and made a good argument for it.

Then the app grew a route group. The slow await moved into
`app/(app)/layout.tsx` — `force-dynamic`, `currentViewer()`, then `getCollection()`
for nineteen hundred cards — and Next wraps layout and page in one implicit
Suspense boundary whose fallback is the group's `loading.tsx`. Nothing about that
move re-scoped the file. One collection-shaped fallback became the answer for
`/dashboard`, `/collection/*`, `/wishlist`, `/settings` and everything else
signed in.

The result was not a near-miss. `/dashboard` is the route you land on after
signing in, and `CardsView.tsx` gates the whole `.cards-tools` row on
`!onProfile && !onDashboard` — so the fallback promised a five-control toolbar
and twenty card tiles that never arrived, under an `<h1>Cards</h1>` that no
screen in the app has ever displayed. `/settings` matched on nothing at all.

Underneath that sat roughly ten smaller mismatches, all the same failure mode:
the rail was missing its head row, its era divider and its avatar footer, so
every outline in it sat ~60px above the row it stood for; set logos were 120px
against a real 160px; card tiles hardcoded `data-view="grid"` values against a
reader whose saved view might be list; the four tab-bar slots were empty `<span>`s
that rendered ~12px tall against a real slot's ~45px, so the bar roughly
quadrupled in height on arrival — in a file whose own comment claimed the bar was
drawn precisely so "a colour arrives rather than a layout moving".

**ADR-0018 is this same file drifting once before.** Its conclusion was "a route
with a loading state is a standing reason to grep", which is a rule that depends
on a person remembering. That did not survive one route becoming seven.

## Decision

**The group's fallback draws only what is identical on every route in the group.**
The frame, the rail, the bar. Inside `.cards-main` it draws one outline where the
heading lands — every screen in the group has an `h1`, and that is the only claim
that is true everywhere — and nothing else.

Concretely, out: the hardcoded "Cards" heading, the `.cards-count` bar (the real
one only renders when `total > 0 && !onProfile`), the entire `.cards-tools` row,
both `<Card className="cards-set">` panels, and all twenty card tiles. The set
panels were doubly wrong: `cards.css` refuses that glass panel in so many words
("putting a white panel around a grid of white-bordered cards drew a box around a
box"), so the real page dissolved a panel the fallback had drawn.

In, because they are chrome and were missing: the rail's `>1000px` head row and
its sticky avatar footer, both mirroring `CardsSidebar.tsx`; the era divider
between the destination rows and the set rows; real internal structure in the tab
bar's slots so the bar does not change height.

Deleted rather than corrected: the rail's mobile-only title. It said "Cards"
where `CardsSidebar` says "Sets" for a documented reason — but it sat inside
markup that can never be seen, since `cards.css` hides
`.cards-rail:not([data-pane="rail"])` below 1000px and the fallback rail sets no
`data-pane`. Wrong copy in unreachable markup is a thing to remove, not to fix.

The rail's row count went from nine identical outlines to three, a divider, and
two — the actual signed-in `setsAsRow` rail. Nine was chosen to "reach the bottom
of a laptop rail", which is a fallback filling space rather than standing in for
something.

### Two reversals worth stating

**The add circle is now drawn.** The old file deliberately omitted the plus and
the pill because "the fallback knows neither" whether you are signed in. True on
`/cards`. Not true here: this group's layout `redirect`s a viewerless request
before rendering can reach this file, so signed-in is a fact. The pill stays out
— which slot it belongs under genuinely is unknown.

**The live region says "Loading", not "Loading the collection."** It stands in
for `/settings` as readily as for the cards.

## Alternatives considered

**Make the skeleton fully correct, per route.** A `loading.tsx` for `/dashboard`,
`/collection`, `/settings` and the rest. The most faithful result and the
explicitly offered option. Rejected: five-plus hand-maintained copies of layouts,
which is ADR-0018's failure multiplied rather than removed. The maintenance cost
lands on whoever next changes a screen and does not think about its skeleton.

**Stream the collection behind a Suspense boundary inside `AppShell`.** The chrome
would paint immediately from the layout, only the collection-dependent parts would
wait, and `loading.tsx` could be deleted outright. This is the better end state
and is not rejected on merit — it is deferred. `AppShell` is a client component
taking `sets` as a prop and providing it through context to seven screens, so
streaming means restructuring that boundary, and ADR-0014's cross-request cache
already makes the wait short in the common case. Revisit when `AppShell`'s props
are being changed for another reason.

**Delete the fallback entirely.** With no `loading.tsx`, Next keeps the previous
page on screen during a client transition, which is pleasant; pair it with a
pending state on the pressed nav row. Rejected on the hard load: signing in would
show nothing at all for 200–550ms, which is the dead-button problem the fallback
was created to solve.

## The content region, decided second

A first pass left the main pane empty below the heading outline, on the strict
reading of the rule: an empty pane cannot be wrong. Bart asked for something
there, and the strict reading was too strict. On a 1440px screen a heading bar
alone above 700px of white reads as a page that failed rather than one that is
coming.

So: **one region, not a layout.** A single full-width block below the heading,
`h-[min(420px,52vh)]`, rounded like the page's own surfaces. It claims the only
thing all seven screens share — that something fills this pane, starting here —
and says nothing about what is in it. Sized in `vh` and capped, rather than to a
content guess, because its height is genuinely arbitrary and that is the honest
way to write an arbitrary number.

No sweep on it, for the reason the old file gave for card scans and which applies
harder to a single large block: a band of light across a 40px text bar reads as
loading, the same band across half the window reads as the page flickering.

This is the one element here that is a placeholder rather than a stand-in, and
the line it must not cross is subdividing: the moment it becomes three blocks, or
a block with a bar above it, it is guessing at a layout again and this ADR has
been undone.

## Consequences

**One real bug found and fixed while measuring, which the shared classes hide from
the real bar.** `tabbarItemClassName` sizes every slot from `--tab-w`, whose
default is a deliberately generous 104px (`tabbarClasses.ts` records a tight
estimate clipping "Dashboard" on a real phone). The real bar can afford that,
because `CardsTabBar`'s `useLayoutEffect` measures the widest label on mount and
writes a smaller value back. **This file has no effect and no labels to measure,
so it would hold 104px forever:** four slots at 104 plus the 40px add circle plus
the gaps needs 512px, and a 500px window gives the track 466 — the two end slots
hang out of the capsule.

Fixed in this file only, with a formula rather than a number:
`--tab-w: min(104px, calc((100vw - 2*var(--space-4) - var(--control-h) - 56px) / 4))`
— divide what is actually left between the four, never exceed the default. Measured
after: 93px slots inside a 422px track on a 500px viewport (was 104px slots
needing 512 in 466), and unchanged at 104px from roughly 620px up, so the
641–1000px band the real bar occupies is untouched.

Worth stating plainly because an earlier version of this record got it backwards:
this was **not** a pre-existing overflow shared with the real bar. It is specific
to a bar with no measurement effect behind it, which is what a server-rendered
fallback is. Anything else that draws this bar without `CardsTabBar` needs the
same line.

**Below 500px is unverified.** Chrome headless clamps its window to a 500px
minimum on macOS, and both browser MCPs were unavailable this session, so a real
phone width was never rendered. The formula is continuous and floors on the
slots' own `min-w-[56px]`, so 375px computes to ~62px slots inside a 343px track,
which fits — but that is arithmetic, not a measurement.

Three comments citing `app/cards/loading.tsx` were corrected. That file does not
exist and `/cards` is now `redirect("/collection")`. Two were harmless path rot;
`app/cards/[id]/page.tsx` was citing it as the live cause of a soft 404, and since
that route is outside the `(app)` group it does not inherit this fallback either
— the diagnosis is now marked as unverified rather than left reading as fact.

## Related

- Caused by: FB-0010
- Precedent: ADR-0018 (the same file drifting from its consumers once before)
- Constrained by: ADR-0012/0017 (an unconditional Tailwind utility beats a
  conditional legacy reset — why the rail keeps its CSS-owned `display`),
  ADR-0014 (the assembled-collection cache, which is why the wait is usually short)
- Deferred alternative touches: ADR-0034 (`/settings` deliberately has no
  `loading.tsx` of its own; under this decision it does not need one)
