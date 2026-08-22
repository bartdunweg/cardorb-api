# State

Where this project stands right now. Read it at the start of a session; update it at the end.
This file is deliberately short — it orients, it does not document. The rules that apply now
live in `CONVENTIONS.md`.

Rewrite it in place. This file has no history worth keeping; the history is in git.

Keep it under 100 lines, and keep at most one section about a previous release. `CLAUDE.md`
loads this file on every request, so its length is a cost paid continuously.

## Now

Card Orb is live at cardorb.com and serves the iOS client an API. Nothing is half-built. The
current branch (`bartdunweg/dubai`) carries one job: bringing this repository onto
dev-standards v0.26.0.

## Last session

- The decision and feedback archive was retired. 133 records went; the rules that survived
  them are in `CONVENTIONS.md` and the reasoning is in `git log -p CONVENTIONS.md`.
- This repository moved from standard v0.24.0 to v0.26.0. The generated blocks in `CLAUDE.md`
  and `AGENTS.md` were regenerated, the product regions trimmed of what they now duplicate.
- `CONVENTIONS.md` was reshaped to the v0.26 format: a fourth `Why` column on all 47 rules,
  bare rule IDs, `Intent` retired in favour of `reviewed`, and R-STYLE-018 split into a
  reviewed rule about cascade layers and an enforced one about the foil colours.
- `scripts/verify.sh` gained a real `conventions` check where it used to print a `skip`, and
  lost the record-number check, which had no archive left to look at.
- `CHANGELOG.md` and `changelog.d/` moved from `docs/` to the repository root.
- Verified with `./scripts/verify.sh` and `check-standards.sh`.

## Next

Nothing is queued. Name the next piece of work when you start it.

## Open

- **`lib/core` is not split by domain.** Fine at two features; ambiguous at three.
- **dev-standards v0.26.0 contradicts itself about a rule-count ceiling.**
  `templates/CONVENTIONS.md.template` says "There is no rule-count ceiling. Freshness is the
  brake, not size."; `templates/verify.sh.template` fails above 15 rules. This project has 47
  and follows the template. `scripts/verify.sh` therefore runs every clause of the standard's
  `conventions` check except the count, and says so in a comment. The upstream fix is open as
  `bartdunweg/dev-standards#45`, which drops the clause from the template; put nothing back here
  when it merges, because the count is going away rather than the exception.
