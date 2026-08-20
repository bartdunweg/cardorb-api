---
id: ADR-0064
title: The toolbar wraps below 900px again — the rule had been dead in production
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart]
superseded-by: null
tags: [css, tailwind, cascade-layers, regression, cards-css]
---

# The toolbar wraps below 900px again — the rule had been dead in production

**This one is visible, and it shipped broken.** Everything else in this branch was
meant to leave the screen alone; this changes what `/collection`, `/wishlist` and
the public profile look like between roughly 640 and 900 pixels.

## What was found

`cards.css` carried this, with a comment arguing it at length:

```css
/* Narrow: the bar wraps rather than scrolls. It scrolled for a while, and a
   scrolling row of controls hides controls: the search took the full width and
   pushed the era switch, Filter and the layout toggle off the right edge, where
   nothing suggested they were still there. */
@media (max-width: 900px) {
  .cards-search { flex: 1 0 100%; max-width: none; }
}
```

The element it names carries `flex-[0_1_260px]` as a Tailwind utility. A utility
beats a legacy-layer rule regardless of the media query, so **that block has not
applied since the search field was migrated.** The toolbar has been squeezing
four controls onto one row at 800px instead of wrapping — the exact behaviour the
comment says was rejected.

Found by moving the rule onto the element, which made it apply, which changed six
screenshots. The baselines were of the broken state.

## Decision

Keep the wrap. The rule moves onto the element as `max-[900px]:flex-[1_0_100%]`
and `max-[900px]:max-w-none`, so it is a conditional utility against an
unconditional one and wins the way the media query used to.

Below 640px it also takes `max-sm:flex-[1_1_0] max-sm:min-w-0`, which was a
second, narrower block saying the search shares the row again once there is
nothing beside it.

## Why not simply keep what production looks like

Because nobody chose it. The squeezed row is not a design that beat the wrapping
one; it is a cascade accident, and the reasoning against it is written down in
the file it broke. Restoring it is the smaller change: it makes the code and the
screen agree again.

The counter-argument is real and worth stating — the app has looked this way for
weeks and nobody complained. If the squeezed row is preferred, the fix is to
delete the intent from the comment as well as the rule, rather than to leave a
paragraph in the codebase describing behaviour the app does not have.

## Consequences

- Six baselines updated: `/collection`, `/wishlist` and the public profile, at
  narrow and middle. Wide is unaffected — the rule never applied there.
- **This is the sixth time ADR-0017's failure mode has been found in this
  migration**, and the first where it had reached production rather than being
  caught in the same sitting. The first five were: ADR-0012 (margins), ADR-0017
  (the pane toggle), ADR-0018 (a second consumer), the grid gap and the main
  pane's `display: flex` — both earlier in this branch.
- The lesson holds and is now cheap to state: **when a legacy rule and a
  utility name the same property, the utility wins even if the legacy rule is
  the conditional one.** Every migration step in this branch has had to answer
  it, and `!` or a matching variant is the answer.

## Related

- ADR-0012, ADR-0017, ADR-0018 — the same fact, three earlier times.
- ADR-0052 — where the `cards.css` migration was told to stop, before this
  branch reopened it.
