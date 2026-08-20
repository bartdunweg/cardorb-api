---
id: ADR-0060
title: Only the holo and the card hover are protected; the palette goes purple
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
supersedes: ADR-0055 (the identity list), ADR-0059
tags: [ui, design-system, untitled-ui, identity, colour]
---

# Only the holo and the card hover are protected; the palette goes purple

Supersedes **ADR-0055's identity list** and **ADR-0059** outright. ADR-0055's
tie-break rule — Untitled UI's value is the default — stands and is now nearly
absolute.

## Context and problem statement

ADR-0055 protected four things as Card Orb's identity: the glass material, the
orb, the holographic cards, and the tint blue. It did so because a
multiple-choice answer earlier that session had asked to keep them.

Corrected directly (FB-0014):

> UI is van mijn betreft nog helemaal niet gedefinieerd, dus ik wil het op zich
> wel helemaal "untitled" hebben. […] Alleen de hole, het hover-effect van een
> kaart, moet blijven

The premise of the old list was that these were considered choices. They were
not — the interface had never been designed, only accumulated.

## Decision

**Two things are protected, and they are both effects on a card:**

1. **The holographic shine** — `app/styles/poke-holo.css`, 300 lines.
2. **The card hover** — the `hover-tilt` package, and the tilt/lift on a card
   tile.

Neither has an Untitled UI equivalent, because neither is a component. They are
what makes this a Pokémon card app rather than a generic collection tracker.

**Everything else is Untitled UI's**, and where the two disagree the answer is no
longer "argue it" but "delete ours". Three consequences were settled explicitly:

| Question | Answer |
|---|---|
| The accent colour | **Untitled UI's purple.** Their full palette, not Card Orb's blue. |
| The orb wordmark | UI, not brand — it may go or be replaced. |
| The app screens | Rebuilt on Untitled UI's page templates. `cards.css` goes. |

## What this reverses

- **ADR-0059** made every primary surface Card Orb blue. They are purple now, by
  the same one-token mechanism, which is why that record is superseded rather
  than amended — its reasoning was right and its conclusion is obsolete.
- The brand ramp built in **ADR-0055 / the `brand` export in `lib/design/tokens.ts`**
  is deleted. The eleven values were derived from Untitled UI's own lightness
  curve in the tint's hue; removing them lets upstream's purple apply directly,
  which is now what is wanted. The contrast reasoning it carried is not lost —
  it moves to a note on `tint`, which `cards.css` still reads.
- **ADR-0057's finding still applies and must not be re-broken.** Untitled UI's
  `brand-600` is `rgb(127 86 217)` and carries a white label; that is measured
  below rather than assumed, because "their palette is fine" is exactly the
  assumption that put a 4.02:1 button on screen last time.

## The orb, deliberately not deleted yet

The answer was "UI: may go or be replaced", and it is not being acted on in this
record. The mark is not only interface: it is the favicon, the app icon, the web
manifest and both OG images, and it is *generated* by `Tools/GenerateAppIcon.swift`
in the separate `bartdunweg/cardorb-ios` repository (ADR-0048), which also ships
it. Removing it from the web is a change to something two repositories and the
public share.

That is a separate decision with its own blast radius, and it is flagged rather
than folded into a styling sweep. ADR-0049 exists because one icon file shipped
to production wrong once already.

## Consequences

- `poke-holo.css` and `hover-tilt` are **not to be touched by any later sweep.**
  This record is the reason, and a sweep that removes them is a mistake rather
  than a judgement call.
- `cards.css` (1,169 lines), the glass recipe in `components.css`, and whatever
  of `tokens.css` loses its last reader are all now deletions rather than
  migrations. The four ADRs about that migration breaking (0012, 0017, 0018,
  0020) stop being warnings about *converting* it and become warnings about how
  much of it nobody remembers the reason for.
- The app stops looking like itself. That is the instruction, and the screenshot
  harness stops being a regression check for these screens entirely — there is
  no "before" worth matching.

## Confirmation

Measured, not assumed — Untitled UI's own brand steps against a white label:

| Step | Used as | Value | Contrast | Needs | Verdict |
|---|---|---|---|---|---|
| `brand-600` | `bg-brand-solid`, under a white label | `rgb(127 86 217)` | 4.96:1 | 4.5 | passes |
| `brand-700` | `text-brand-secondary` | `rgb(105 65 198)` | 6.62:1 | 4.5 | passes |
| `brand-500` | `border-brand`, the focus ring | `rgb(158 119 237)` | 3.33:1 | 3.0 | passes |

Untitled UI's purple clears every threshold Card Orb's blue had to be darkened
for. That is luck rather than diligence on this repository's part, and it is
written down so the next palette change gets measured too.

`./scripts/verify.sh` exits 0 — 488 tests in 42 files.

## Related

- FB-0014 — the correction, quoted verbatim.
- ADR-0055 — the tie-break rule, which survives; its identity list, which does not.
- ADR-0057 — the contrast rule that still binds.
- ADR-0048, ADR-0049 — why the orb is a separate decision.
