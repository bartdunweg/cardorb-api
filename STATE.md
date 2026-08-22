# State

Where this project stands right now. Read it at the start of a session; update it at the end.
This file is deliberately short — it orients, it does not document. The rules that apply now
live in `CONVENTIONS.md`.

Rewrite it in place. This file has no history worth keeping; the history is in git.

Keep it under 100 lines, and keep at most one section about a previous release. `CLAUDE.md`
loads this file on every request, so its length is a cost paid continuously.

## Now

Card Orb is live at cardorb.com and serves the iOS client an API. Nothing is half-built.

This session was a state review that turned into four pieces of work, all done and all
uncommitted (see `## Open`). `src/lib/core/` is now split into `catalogue/`, `collection/`
and `account/`; `src/features/` has its first tests; two rules were added; the two stale
branches were judged. `./scripts/verify.sh` exits 0 across all eleven checks, with 572 tests
where there were 525.

## Next

1. **Commit the working tree.** It is one coherent change and it is green. Nothing in it is
   user-visible, so it needs no `changelog.d/` fragment.
2. **Decide the two stale branches.** `origin/bartdunweg/catalog-wide-search-index` and
   `origin/bartdunweg/check-tailwind-conversion` are both superseded (see `## Open`). Deleting
   them is a person's call, not an agent's.
3. **Keep pulling decisions out of `CardsView.tsx`.** It is 1,633 lines and eight of its
   `useMemo` bodies still hold a decision no test can reach: `eraOptions`, `valueOptions`,
   `ownershipOptions`, `activeFilters`, `dex`, `dexShown`, `visibleSets`, `activeTab`. Same
   move as `cards-filter.ts` — a plain module beside the component.

## Open

- **Uncommitted in this workspace:** 118 tracked files changed plus six new ones
  (`src/features/collection/components/cards-filter.ts` and five `*.test.ts(x)`). Most of the
  118 are import-path rewrites from the `lib/core` split. Safe to commit as one change:
  `verify.sh` is green, and no behaviour was meant to change.
- **R-STRUCT-007 has known violations on the day it was written.** The eight `useMemo` bodies
  listed under `## Next` item 3 are decisions still living inside a component. The rule is
  right and the code has not caught up; this is the gap, named rather than hidden.
- **Both unmerged branches are superseded, and neither can be merged as-is.** Their paths
  predate the move to `src/` and `check-tailwind-conversion` still edits the Notion integration
  that was removed. `catalog-wide-search-index` built cross-set search as a Postgres index
  refreshed by a weekly cron; what shipped instead queries pokemontcg.io live with a
  five-minute cache. The local-index idea is still the better answer if that third-party
  dependency ever becomes a problem — that is the part worth keeping, not the branch.
- **Playwright's `public` project selects zero tests.** It matches `cards-css.spec.ts`, which
  was deleted when that migration finished, so `playwright.config.ts:110` runs nothing and says
  nothing. Repointing it at the public pages or deleting it are different decisions; measured
  with `npx playwright test --project=public --list` → `Total: 0 tests in 0 files`.
- **`lib/core/collection/value-chart.ts` has a damaged sentence** in its header, around "the
  paths had gone unread since for what was left behind and why it is gone". Something was lost
  in an earlier edit. Nobody now knows what it meant, so it was left alone rather than guessed
  at.
- **dev-standards v0.26.0 contradicts itself about a rule-count ceiling.**
  `templates/CONVENTIONS.md.template` says "There is no rule-count ceiling. Freshness is the
  brake, not size."; `templates/verify.sh.template` fails above 15 rules. This project has 49
  and follows the template. `scripts/verify.sh` therefore runs every clause of the standard's
  `conventions` check except the count, and says so in a comment. The upstream fix is open as
  `bartdunweg/dev-standards#45`, which drops the clause from the template; put nothing back here
  when it merges, because the count is going away rather than the exception.
