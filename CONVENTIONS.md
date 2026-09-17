# Conventions

The rules with an ID that apply **now**, in this repository, beside the path-scoped principles in
`.claude/rules/`. A rule is rewritten or deleted the moment it stops being true; what it used to
say is in `git log -p CONVENTIONS.md`. A request from the owner outranks any rule here: say which
one it departs from, then do it.

- `Enforcement` is `reviewed`, or `enforced by <what enforces it>`. A rule nothing checks is dropped
  or made checkable.
- `Why` is one sentence. Where the reason is genuinely lost, write `unknown`.
- IDs are stable and never reused. They continue the numbering of `bartdunweg/cardorb-web`'s
  CONVENTIONS.md, so an ID named in a conversation means one rule across both repositories.
- Present tense, imperative, no dates.

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-DATA-004 | A data fix is a rule the ingest or the read applies to every card, new and old (`src/lib/core/catalogue/`, `tcgplayer-rules.mjs`, `card-number.mjs`), plus a check in `scripts/data-health.mjs` that compares what is stored with what the rule gives today. A hand list is only for facts no rule can derive, and gets a check that flags a new card of its kind. A migration alone fixes only the past. Changing a rule means the stored data follows by itself (the nightly copy rewrites every set within `SET_STALE_DAYS`; a derived value is read, not stored) or a data-health check goes red. | reviewed; each check it asks for is enforced by `.github/workflows/data-health.yml` | Fixes made by list or by migration left the next set wrong: 30th Classic Collection came with TCGdex's numbers and no rarity where Celebrations' Classic Collection had both put right by hand. |

**Where a rule and the code disagree**, the rule is dead or the code is wrong. Do not decide that
alone: say so in the pull request, and ask the owner.
