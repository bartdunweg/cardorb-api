---
id: ADR-0086
title: Every tab is the width of the widest, and the add circle leaves the bar to pay for it
status: accepted
date: 2026-08-22
scope: repo
deciders: [Bart]
superseded-by: null
supersedes: null
amends: ADR-0050
tags: [tabbar, layout, grid, intrinsic-sizing, temporary]
---

# Every tab is the width of the widest, and the add circle leaves the bar to pay for it

Reverses the per-label sizing half of ADR-0050 (`flex-initial min-w-0`) with a
different mechanism. ADR-0050's diagnosis is not being contradicted — the row
still may not overflow, and this keeps that — so this amends it rather than
superseding it. ADR-0030 remains the record of the first, JavaScript-measured
attempt at equal widths and why it was thrown away.

## Context and problem statement

FB-0022: *"In de tabbar op mobiel moeten alle tabs even breed zijn. Momenteel is
de avatar minder breed dan de rest… neem daarvoor de breedte van de breedste
variant aan."*

The avatar slot is not narrow because of the avatar. `<Avatar className="size-5">`
is exactly the 20px every other icon is drawn at, so the icon row contributes the
same in all four slots. Since ADR-0050 a slot is as wide as its own label, and
"You" is the shortest of Dashboard / Collection / Wishlist / You. Nothing made it
wide.

**The constraint that made this hard.** ADR-0050 removed equal widths for a
measured reason: four fixed slots plus the 40px add circle need ~390px, a 360px
phone gives the track 328, and slots that cannot shrink overflow out of both ends
of a centred capsule. That was FB-0011, reported five times as a missing margin.
Equal widths could not simply come back.

## Decision

### 1. The track is a grid of `fr` columns

`tabbarPagesClassName` goes from `flex items-center justify-center` to
`grid grid-flow-col auto-cols-fr items-center`.

`auto-cols-fr` is `grid-auto-columns: minmax(0, 1fr)`. In a grid container whose
width is indefinite — `w-auto`, which this is — every `1fr` track resolves to the
maximum of the tracks' max-content sizes. "All equal, at the widest" is not
computed anywhere; it is what an fr track *is*. Three consequences worth naming:

- **The capsule still hugs.** Its width is the sum of the tracks plus the gaps
  and `p-2`. This is what Bart asked for after briefly agreeing to a full-width
  bar and withdrawing it in the same minute (FB-0022's second quote).
- **The row still cannot overflow.** The `minmax(0, …)` floor is load-bearing:
  plain `1fr` floors at min-content, and a row of nowrap labels that cannot go
  below min-content is exactly the ADR-0050 failure. With a 0 floor the tracks
  shrink together and the labels truncate equally.
- **No measuring.** ADR-0030 hand-rolled this with a `--tab-w` var computed on
  mount, on `document.fonts.ready` and on every `ResizeObserver` tick, and got a
  clipped "Dashboard" on a real device anyway. That apparatus stays deleted.

`grid-flow-col` rather than an explicit template, because the slot count is not
fixed — four signed in, three on the public `/user/<name>` bar. Implicit columns
size by the same rule, so one class string covers both with no inline style and
no branch. The pill is `position: absolute` and is therefore not laid out as a
grid item at all, so it creates no track of its own.

### 2. `px-1.5` on the slot becomes `px-1`, and it stopped meaning what it meant

At `px-1.5` a 360px phone rendered "Dashbo…" — measured, screenshotted, and the
exact symptom that reopened ADR-0030 twice on real-device screenshots.

The value changed because its job did. While a slot hugged its label, this was
the space around the words, and ADR-0050 picked 6px so the pill's inner padding
came out equal on all four sides. Neither is true now: the track decides the
width, the label is centred in whatever it gets, and above ~375px the track is
already wider than any padding here reserves. What `px` is now is **the
truncation floor** — the last room a label keeps before `truncate` takes over —
and it is invisible except when the bar is being squeezed. 4px is what puts
"Dashboard" through a 360px phone intact.

Four ways to buy those pixels back were measured at 360px before choosing:

| option | slot | clipped |
|---|---|---|
| as it stood (`gap-2 p-2 px-1.5`) | 72 | Dashboard |
| `gap-1` + `p-1` on the track | 76 | — |
| `gap-1` + `p-1.5` on the track | 76 | — |
| **`px-1` on the slot** | **72** | **—** |
| 11px label | 71 | — |

`px-1` was chosen because it is the only one that changes nothing outside the
slot: the capsule's width, the gap between slots and the inset from the capsule's
edge are all untouched, so ADR-0030's hard-won "one number for every gap here"
(`p-2` and `gap-2`, settled after nine spacing complaints) is not reopened.

### 3. The add circle leaves the bar — deliberately temporary

**This is the part to read before changing anything here.** Four equal slots plus
the 40px circle need ~366px; without it they need 328 and fit a 360px phone
exactly. So the plus had to go for the rest of this to work, and Bart chose where:
*"Misschien het plusje uit de tabbar halen en gewoon alleen maar op dashboard
tonen rechtsboven. Voor nu eventjes."*

- `CardsTabBar.tsx` loses the button, the `onAdd` prop and the left/right split
  that existed only to put it in the middle. `tabbarAddClassName` is deleted.
- `CardsDashboard.tsx` gains a title row on SetIndex's pattern — heading left, one
  action right — carrying Untitled UI's `Button`, icon-only, `color="primary"`,
  the same shape as the rail's own plus down to the tooltip and `aria-label`. It
  is hidden at ≥1001px, the exact mirror of the rail button's
  `[@media(max-width:1000px)]:hidden`, so there is one plus at every width.
- The failed-fetch branch in `DashboardScreen.tsx` deliberately gets no button:
  if the collection could not be read, offering to add to it points at the thing
  that just broke.

**What it costs, stated plainly.** On a phone, the tab bar's plus was the only
*persistent* way to add a card — the rail's is desktop-only, and the remaining
routes in are an empty-state CTA, the per-card buttons in browse, and a one-time
onboarding link. Adding a card from `/collection` or `/wishlist` on a phone now
means navigating to the dashboard first. That is a real regression, accepted
knowingly and for now.

**What would reverse it.** Any of: putting the plus back as a floating button
above the bar; repeating the dashboard's title-row action on `/collection` and
`/wishlist`; or shortening the labels enough that four equal slots and a circle
fit again. The first two keep the equal widths this record is about; only the
third gives the bar its middle back.

## Verified

Measured in the dev build at `/user/bartdunweg`, in a real browser. The public
bar has three slots, so the four-slot signed-in shape was built in the page from
the same DOM and the same classes, with the real labels — this workspace cannot
sign in, the same limitation ADR-0030 recorded.

| viewport | capsule | margin l/r | slots equal | slot | overflow | truncated |
|---|---|---|---|---|---|---|
| 320 | 288 | 16/16 | yes | 62 | 0 | Dashboard, Collection |
| 340 | 308 | 16/16 | yes | 67 | 0 | Dashboard |
| 360 | 328 | 16/16 | yes | 71.9 | 0 | — |
| 375 | 328 | 24/24 | yes | 71.9 | 0 | — |
| 390 | 328 | 31/31 | yes | 71.9 | 0 | — |
| 402 | 328 | 37/37 | yes | 71.9 | 0 | — |
| 430 | 328 | 51/51 | yes | 71.9 | 0 | — |
| 768 | 328 | 220/220 | yes | 71.9 | 0 | — |
| 1000 | 328 | 336/336 | yes | 71.9 | 0 | — |

`scrollWidth == clientWidth` at every width — the row overflows nowhere — and the
capsule is never off-screen. The truncation floor rose slightly — full labels
down to 360px, "Dashboard" clipping at 340 and "Collection" joining it at 320,
where ADR-0050's per-label sizing held all four to about 340. Every current phone
is at 360 or above and shows all four in full.

On the real three-slot bar, pressing each tab in turn: the pill matches the active
slot's box exactly every time, stays 67px wide on all three, and keeps an 8px
inset top and bottom and against whichever capsule edge it is nearest. It slides
without resizing again, which is what ADR-0030 wanted and ADR-0050 traded away.

**Not measured:** a real signed-in session at mobile widths, and therefore the
dashboard's new plus in place. `npm run check` is green and the geometry above is
measured from the real CSS, but nobody has looked at `/dashboard` on a phone.

## Consequences

- The bar reads as a grid again, which is what was asked for, and the avatar slot
  is no longer the odd one out.
- Below ~340px "Dashboard" truncates, and below ~330px "Collection" joins it.
  Graceful, with a working bar behind it — the same trade ADR-0050 documented,
  at a slightly lower threshold.
- Adding a card on a phone is dashboard-only until the plus is given a permanent
  home. See above.
- One export fewer, one prop fewer through two call sites, and no measuring hooks
  anywhere near this file.

## The lesson worth carrying

**A layout property can outlive the reason it was given.** `px-1.5` was chosen so
the pill's padding came out equal on four sides; the moment slots stopped hugging
their labels that was no longer what the value did, and reading it as if it still
did would have led to defending 6px for a property it no longer produced. When a
sizing mechanism changes, re-derive what each number now controls before deciding
whether it may move.

## Related

- `docs/feedback/0022-every-tab-the-same-width-as-the-widest.md` — the report.
- `docs/decisions/0050-tab-bar-slots-fit-the-screen-they-are-on.md` — what this
  amends, and the overflow diagnosis it must not undo. FB-0011 is behind it.
- `docs/decisions/0030-tabbar-profile-avatar-and-track-min-width.md` — the first
  attempt at equal widths, by measurement, and why it kept clipping.
- `docs/decisions/0046-loading-fallback-draws-shared-chrome-only.md` — why
  `app/(app)/loading.tsx` drops the add circle with the real bar and does not
  gain the dashboard's.
