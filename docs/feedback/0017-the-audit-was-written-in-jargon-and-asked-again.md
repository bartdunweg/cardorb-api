---
id: FB-0017
date: 2026-08-21
source: Bart
source-type: stakeholder
severity: 2
sentiment: negative
status: addressed
tags: [process, communication, untitled-ui, scope]
---

# The audit answered in jargon, and then asked a question FB-0016 had closed

## What was said

> Wat bedoel je?
>
> Ik wil gewoon dat de buttons buttons zijn en dat de rest ook allemaal klopt.
>
> Snap ik niet goed.

English translation: *"What do you mean? I just want the buttons to be buttons
and the rest to be right too. I don't really understand."*

## Context

Said in answer to a multiple-choice question that offered, as options, "the 10
unconstrained untitledButton call sites -> `<Button>`", "FilterChips, Tag and
ThemeToggle -> their vendored counterparts", and "the 4 token cleanups (Modal
rgba, dead aliases, empty rules, hex guard)".

The audit those options summarised was asked for and was correct. The way it was
put to the user was not.

## Interpretation

*Hypothesis, not fact.*

Two separate mistakes, and they compound.

**One: the question should not have been asked at all.** FB-0016 established the
rule — *a question is worth asking when the answer trades something away* — and
closed "does everything mean everything" for the third time. Of the four options
offered, three traded nothing: converting a hand-painted `<button>` to the
component whose classes it was already copying changes no behaviour and no
pixels, and the harness proves it. Only the icon library was a real fork, and
that one was answered without hesitation. The rest was work, presented as a
fork. That is FB-0016's finding recurring in a new shape: not "is everything
everything", but "which parts of everything".

**Two: the options were written in the codebase's vocabulary, not the user's.**
"Unconstrained untitledButton call sites" and "Modal rgba, dead aliases, empty
rules, hex guard" are the names an implementer uses after reading the files. To
anyone who has not, they are not choices — they are noise, and asking someone to
pick among them asks them to do the reading first. `CLAUDE.md` already requires
short, common words and one idea per sentence; the audit's findings were written
that way and the *question* was not.

"Ik wil gewoon dat de buttons buttons zijn" is the whole standard, stated
plainly: use the real component, not a copy of its appearance.

## Action

- [x] Do all four, not a chosen subset. Recorded in the approved plan.
- [x] Reserve questions for genuine forks — the icon library was one, and it was
      right to ask that one alone.
- [x] When a question is genuinely needed, name the thing by what the user would
      see, not by its identifier: "the buttons in Settings and the sidebar", not
      "the untitledButton call sites".
- [x] Answer in the language the user writes in. This exchange was in Dutch and
      was answered in English throughout, which is its own barrier on top of the
      jargon.

## Related

- Feedback: FB-0016 — the same rule, third restatement there and fourth here;
  FB-0013, FB-0014, FB-0015 — the standing "Untitled UI unless it costs
  something" instruction.
- Decision: ADR-0066 — the audit this exchange followed.
