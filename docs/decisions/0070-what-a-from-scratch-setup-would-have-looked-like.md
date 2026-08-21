---
id: ADR-0070
title: The setup a from-scratch build would have had — four of it applied, two declined
status: accepted
date: 2026-08-21
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0062, ADR-0067, ADR-0069
tags: [ui, design-system, untitled-ui, tooling, typescript, testing]
---

# The setup a from-scratch build would have had

## Context and problem statement

Asked, after the adoption finished, whether building this project from scratch
on Untitled UI and Tailwind would have produced the same setup. It would not.
The answer listed eight things, and the instruction back was to apply them:

> kan je het dan aanpassen op basis van hoe je het zou doen, zodat we die opzet
> kunnen gebruiken?

Four are applied here. Two are declined, one of them because the original
criticism was **wrong** and saying so is the point of a record. Two are real but
too large to ride along with this change.

## Decision 1 — the button recipe is imported, not copied

`untitledButtonClasses.ts` held `COMMON`, `SIZES` and `COLORS` pasted out of
`button.tsx` character for character, with an 84-line test asserting the paste
had not drifted. From scratch nobody writes that.

The reason it existed was real and precisely one file wide. `button.tsx` is
`"use client"`, so a **server** component importing `styles` from it gets Next's
client-reference proxy instead of the object; `styles.common` is `undefined` at
prerender and `/_not-found` died on exactly that. Every *other* consumer was
already a client component, where the import is ordinary.

So `app/not-found.tsx` renders `<Button>` instead — **a server component may
render a client component, it just cannot read a value out of one**, and that
distinction is the whole of it. With that file converted the copy had no reason
left. `untitledButtonClasses.ts` now imports `styles`, is marked `"use client"`
to state the constraint that makes it safe, and the drift test is deleted
because there is no longer anything that can drift.

Verified: `/_not-found` still prerenders as static (`○`) in the build output.

## Decision 2 — icons use their real names

ADR-0067 aliased eleven icons on import (`LayersThree01 as Layers`) to keep the
call sites readable. That reasoning was fine and the outcome was not: it carries
lucide's vocabulary in a codebase that has just removed lucide, and the next
person cannot grep for the icon they are looking at. Every alias is gone; call
sites use the Untitled UI name.

The rename was **not** a global find-and-replace, and could not be: `Search`
appears twenty times in these files and only five are the identifier — the rest
are placeholders, `aria-label`s and prose ("Search by name or narrow by set…").
`X` appears in a comment about a search query, and `Download` in the words
"Download on the App Store". The rename was restricted to the syntactic
positions an icon can occupy (`icon={…}`, `icon: …`, `iconLeading`,
`iconTrailing`, `typeof`, a JSX tag, a ternary arm) and the prose checked
afterwards.

## Decision 3 — vendored code is typechecked, loosely rather than not at all

ADR-0062 put `// @ts-nocheck` on all 38 vendored files, reasoning that a
repository should not hold code it did not author to flags the author never used.
That is right about *this project's* flags and wrong about everything else:
`@ts-nocheck` silences the entire file.

ADR-0066 had already paid for it once — `file-upload-trigger` shipped two faults
that would each have thrown on first render, and neither was a strictness
disagreement. **Turning the check on found a third within seconds**:
`nav-account-card.tsx` imports `@react-types/overlays`, which is not a
dependency and not in `node_modules`. Type-only, so it could never have thrown;
it would simply have failed to compile the moment anything looked. Fixed to
`react-aria-components`, which re-exports the type and is a dependency.

`tsconfig.vendored.json` replaces the directive. It keeps `strict` — **turning
`strict` off was tried first and invented four errors of its own**, because
losing inference changes what the overloads in `button.tsx` mean — and relaxes
only the four flags this project adds on top (`noUncheckedIndexedAccess`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`). The root project
excludes the vendored trees; `npm run typecheck` runs both.

`scripts/untitled-add.mjs` no longer re-adds the directive, which takes it from
four patches back to three — the number ADR-0058 named as the ceiling.

## Decision 4 — a missing screenshot baseline fails

`playwright.config.ts` sets `updateSnapshots: "none"`. ADR-0069 found that the
baselines are gitignored, so Playwright's default was to write a missing one
from the build under test — which is how three green runs over thirty-five
screenshots carried no signal at all. A missing baseline is now an error that
leaves nothing behind.

Verified by deleting `visual/owner.spec.ts-snapshots` and running: every test
failed with "A snapshot doesn't exist", and **the directory was not recreated**.
`npm run visual:baseline` still passes `--update-snapshots`, which overrides it,
so making baselines stays possible and becomes deliberate.

## Declined 1 — the token generator stays, and the criticism of it was wrong

The from-scratch answer said `lib/design/tokens.ts` → `gen-tokens.mjs` →
`tailwind.generated.css` was over-built, and that a from-scratch project would
import Untitled UI's theme and add ten tokens in a plain `@theme` block.

**That is wrong, and the reason is in the generator's own header.** These values
are read from **TypeScript** as well as from CSS — `manifest.ts`, `themeColor`,
and the OG images, none of which can read a stylesheet. A hand-written `@theme`
block would mean writing every shared value twice, in two languages, with
nothing holding them together. `gen-tokens.mjs --check` in `npm run check` is
what makes that impossible, and this repository has already shipped the bug it
prevents: the OG images used `#767676` for their eyebrow, the exact value
`tokens.css` had rejected for measuring 4.35:1.

A from-scratch build with the same requirement would arrive at the same
generator. Recorded here because the criticism is on the record and should not
outlive the check that disproved it.

## Declined 2 — the identity question is settled, not open

The from-scratch answer noted that ADR-0055 → 0056 → 0060 → 0061 all circle the
same unanswered question, and that it should have been decided once up front.
True as history and not actionable now: ADR-0061 decided it. Re-opening it would
be a redesign, not a setup change.

## Left, and named so the next audit does not think they were missed

- **`CardsView.tsx` is 1,400+ lines.** A real problem and its own change.
- **The legacy `/cards` route still runs beside the `(app)` shell**, carrying a
  tab bar that early-returns for owners. Removing it is a routing change with
  live URLs attached.
- **~16 dead legacy class names** are still written onto elements and read by
  nothing. ADR-0066 already called this its own change; it still is, and it is
  the cheapest of the three.

## Consequences

- `npm run typecheck` runs two projects. A vendored file that cannot compile now
  fails the gate, which is the point.
- One vendored file is edited (`nav-account-card.tsx`), with the reason at the
  edit. ADR-0062's rule — leave vendored code alone — is about *style*, and this
  is the third time a real fault has been found under that exemption.
- The visual harness reports the same fifteen differences from `origin/main` as
  before this change, no more and no fewer, which is the evidence that none of
  the four decisions above moved a pixel.

## Confirmation

`./scripts/verify.sh` exits 0. The harness was run against baselines built from
`origin/main` in a worktree, with the server confirmed alive before *and* after
the run — a run it did not survive was discarded twice while getting this,
exactly as ADR-0069 warns.
