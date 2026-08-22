# Memory map

Layer 3 of the decision model: history, not instruction. An agent reads this
directory only when asked, or when it needs the reason behind a rule it is about
to change. `CONVENTIONS.md` is the only binding source for what applies now.

## Key decisions

None. The 133 records this project once kept were deleted on 2026-08-22 (commit
`d212530`); the rules that survived them are in `CONVENTIONS.md` and the
reasoning is in `git log`. That deletion is deliberate and is not being undone.

This directory exists so the layer has somewhere to land going forward. A new
record is written only for a choice that is far-reaching **and** hard to reverse
— a database, an auth model, a rendering strategy, a framework. Everything below
that threshold is a rule in `CONVENTIONS.md`, not a numbered document.

- `decisions/` — `NNNN-slug.md`, append-only. Supersede, never rewrite.
- `feedback/` — `NNNN-slug.md`. Quote verbatim before interpreting.

Both are empty. That is the correct state, not an omission.
