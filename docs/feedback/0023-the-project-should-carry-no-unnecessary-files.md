---
id: FB-0023
date: 2026-08-22
source: Bart
source-type: stakeholder
severity: 2
sentiment: neutral
status: addressed
tags: [dependencies, repository-hygiene, vendored-code]
---

# The owner wants a small repository and asks what a dependency is for before accepting it

## What was said

> Wat is Theowards Merch überhaupt voor bestand? Is dat voor het Merchant of zo?
> Wat doet hij daarmee? Kunnen we dat niet opschonen?

*"What kind of file is tailwind-merge anyway? Is that for the Merchant or something?
What does it do with it? Can't we clean that up?"*

And, when asked what to do about it:

> Of heb je dat nodig? Of kijk ik wel een heel klein en schoon project met niet
> onnodige files en zo, dus vandaar dat ik het vraag.

*"Or do you need it? I do like a very small and clean project without unnecessary
files and so on, hence why I ask."*

(The first quote is verbatim from dictation; "Theowards Merch" is speech-to-text
for "tailwind-merge", which the owner corrected in a follow-up message.)

## Context

Immediately after ADR-0088 shipped the two control shapes. That work fixed a
`tailwind-merge` bug and added a radius scale to `utils/cx.ts`, so the name
appeared several times in the closing summary — the first time it had been named
in conversation rather than buried in a vendored file.

## Interpretation

Two things are being said, and only the second one is actionable.

- **The literal question has a "no" answer.** `tailwind-merge` is load-bearing:
  240 calls across 50 files, 47 of them the vendored Untitled UI tree, and it is
  what makes a `className` override beat a component's own classes. Removing it
  breaks that contract everywhere. It also is not this project's choice — it
  arrives with Untitled UI.
- **The instinct behind it is right, and points at the wrong file.** The owner is
  telling us what to optimise for: a repository small enough that an unfamiliar
  name is surprising. That is a standing preference, not a one-off request. Where
  it actually bites is the vendored tree — a command menu, metrics, tabs,
  background patterns and illustrations were all copied in with Untitled UI and
  appear to be unused. This repository has form for exactly that cleanup
  (`Drop @untitledui/file-icons, which nothing imports`, #113).

The general rule to carry forward: **say what a dependency is for, in plain words,
at the moment it is introduced** — and prefer deleting unused vendored code over
keeping it "in case". A first grep for unused components produced false positives
(it missed relative sibling imports), so the audit has to be done properly rather
than quickly.

## Action

- [x] Explain what `tailwind-merge` is and why it stays.
- [x] Audit for unreachable files with a walker that follows both `@/` and
      relative imports from Next's real entry points. **The interesting result is
      what it did not find: our own code has zero dead files.** The 32
      unreachable ones are all vendored Untitled UI.
- [x] **Kept, on the owner's decision.** Told that the 32 files are recent and
      that searching Untitled UI happens through the MCP rather than through the
      local copies, the answer was *"Nee, ze zijn vers, laat maar liggen."* That
      leaves ADR-0079's expiry clause — `application/command-menus` vendored with
      no consumer — unresolved for a third time. It is now a known debt rather
      than an oversight.
- [x] Removed two dependencies nothing imports: `@react-stately/utils` and
      `input-otp`, leftovers from Untitled UI's install template and not required
      by `react-aria-components`. `scripts/verify.sh` passes without them.
- [x] Two suspected leftovers checked and **kept**, both false alarms:
      `app/hover-tilt.d.ts` (an ambient declaration, so no import points at it,
      but `<hover-tilt>` is used in `TiltScan.tsx` and `CardItem.tsx`) and
      `scripts/pokedex.mjs` (generates a committed table, run about once per
      Pokémon generation).

**Note on the bundle:** deleting unimported files would have saved nothing —
they are already not shipped. The case for the cleanup is a repository small
enough to read, which is what was actually asked for. Saying so mattered more
than a number here.

## Related

- Decision: ADR-0088 (the change that put the name on screen)
- Decision: ADR-0056 (why Untitled UI is vendored here at all)
