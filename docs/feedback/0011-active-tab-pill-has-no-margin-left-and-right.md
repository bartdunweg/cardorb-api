---
id: FB-0011
date: 2026-08-16
source: Bart
source-type: stakeholder
severity: 3
sentiment: negative
status: addressed
tags: [tabbar, layout, mobile]
---

# The active tab's pill has a margin above and below it but none to its left or right

## What was said

> Onze tapbar klopt nog steeds niet. Er zit dus een ruimte. De tab bar heeft een
> bepaalde breedte, en de actieve tap krijgt een soort van cirkel eromheen.
>
> De marge aan de boven- en onderkant is daar mooi, maar links en rechts is er geen
> marge. Dat moet dus beter.

Translation:

> Our tab bar still isn't right. There's a space. The tab bar has a certain width, and
> the active tab gets a sort of circle around it.
>
> The margin at the top and bottom is nice there, but there is no margin on the left and
> right. So that has to be better.

## Context

`CardsTabBar` — the floating bottom bar on every signed-in route below 1001px, and on a
public profile. "Nog steeds" ("still"): this is the fifth report against the same file,
after ADR-0030's pass through `p-2` / `gap-2` / `--tab-w` and the earlier Tailwind
migration records ADR-0010 / 0028.

## Interpretation

Measured rather than assumed, because four previous passes were assumed. The pill is not
short of a margin — it is drawn *outside* the capsule. At a 360px viewport, with four
slots and the add circle, the row of slots is 352px inside a 342px capsule: the first
slot starts at x = −2 (off the screen) and the last ends at 362 (past the viewport), so
the pill overhangs the capsule's rounded edge by 11px on each side. Nothing overflows
vertically, which is why top and bottom still look right.

Two causes, both confirmed by experiment in a live browser:

1. Slots are a fixed `w-[var(--tab-w,104px)]` and `flex-none`, so they cannot shrink to
   what the bar has room for.
2. The `min-w-max` that was supposed to widen the capsule to fit them under-reserves by
   exactly the add circle's 40px: `.cards-tabbar-add`'s `width: min(var(--control-h), 100%)`
   contributes ~0 to `max-content`, because a percentage cannot resolve during intrinsic
   sizing.

So this reads as one visual complaint but is the collision of two independent sizing
bugs, and it is not fixable by changing a padding value — the third time this file has
been asked to solve an overflow with a spacing tweak.

## Action

- [x] Let every slot size itself to its own label and shrink when the bar is narrow;
      drop `--tab-w` and `min-w-max` entirely. Chosen by Bart over shortening the labels
      or letting them truncate.
- [x] Give the add circle a plain `w-[var(--control-h)]`, no `min(…, 100%)`.
- [x] Verify by measuring the pill's inset on all four sides at 320–800px, for every tab,
      rather than by eye. Result: 9px on all four sides at 320 / 360 / 375 / 390 / 800px,
      no overflow anywhere, labels full down to ~340px and truncating below it.

## Related

- Decision: ADR-0050 (supersedes ADR-0030's fixed slot width)
- Prior records on the same file: ADR-0010, ADR-0028, ADR-0030
- Changelog: `docs/changelog.d/2026-08-16-tabbar-active-pill-margins.md`
