#!/usr/bin/env bash
# Generated from dev-standards. Edit the command blocks freely; keep the contract.
#
# CONTRACT: this is the single entry point that answers "is this project healthy?".
# Exit 0 means every check passed. Any non-zero exit means it did not.
#
# It exists so an agent never has to know whether this project uses pnpm, gradlew,
# xcodebuild, or dotnet. One command, one exit code. The Definition of Done in CLAUDE.md
# refers to this script.
#
# Deliberately no `set -e`: every check runs and reports, so one run shows every problem
# rather than only the first. Failures are collected and returned at the end.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

status=0

run() {
  local label="$1"
  shift
  printf '\n── %s\n' "$label"
  if "$@"; then
    printf 'ok   %s\n' "$label"
  else
    printf 'FAIL %s\n' "$label"
    status=1
  fi
}

skip() {
  printf '\nskip %s — %s\n' "$1" "$2"
}

# --- Secret scanning ----------------------------------------------------------------------
# First, because it is the least recoverable failure and does not depend on the toolchain.
# A secret that reached a commit is already leaked and must be rotated, not deleted.
#
# `gitleaks dir`, not `gitleaks git`: this runs during development, so the secret that matters
# is the one just typed into the working tree. `gitleaks git` only reads committed history and
# would report a clean run on a file that has never been committed — a false pass, which is
# worse than no check. The pre-push hook scans history; this scans what you are about to add.
if command -v gitleaks >/dev/null 2>&1; then
  run "secrets" gitleaks dir . --no-banner --redact
else
  skip "secrets" "gitleaks is not installed. Fix with: brew install gitleaks"
  status=1
fi

# --- Node version -------------------------------------------------------------------------
# Checked first among the project's own checks, because getting it wrong wastes a whole run.
# .nvmrc says 24 and package.json's engines say >=22; @supabase/auth-js declares the same
# floor and @supabase/supabase-js throws "native WebSocket not found" on Node 20 before it
# does anything at all. A shell that ignores .nvmrc is the ordinary way to end up there —
# every check in this repo was once run on Node 20 without noticing.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$node_major" -ge 22 ]]; then
  printf '\nok   node %s\n' "$(node -v)"
else
  printf '\nFAIL node %s is below the >=22 this project requires. Fix with: nvm use\n' "$(node -v 2>/dev/null || echo '(absent)')"
  status=1
fi

# --- Project checks -----------------------------------------------------------------------
# Split rather than one `npm run check`, deliberately. That script chains with && and stops
# at the first failure, which is the opposite of what this file promises: every check runs so
# one pass shows every problem. The commands are the same ones `npm run check` composes, so
# the two cannot drift.

# The design tokens are generated into app/styles/tailwind.generated.css. --check fails if the
# committed file no longer matches the source, which is how a token edit that was never
# regenerated gets caught before it reaches a page.
# --check, never --write. A verify script that fixes what it finds reports a pass on a
# working tree it just changed, which is how an unreviewed reformat rides along with a
# feature commit. `npm run format` is the one that writes; this one only judges.
#
# Scope is set by .prettierignore, and the argument is there: this formats code, not
# prose. Every .md in the repo is hand-wrapped and Prettier would reflow it.
run "format"    npx prettier --check .
run "tokens"    node scripts/extract-theme-values.mjs --check
run "typecheck" npm run typecheck
run "test"      npm run test
run "lint"      npm run lint

# The build is not redundant next to typecheck. It is the only step that parses the CSS, and a
# broken selector has reached main that way before with tests and typecheck both green — the
# same reason .github/workflows/check.yml runs it. It is also the only step that would catch a
# route which cannot be rendered the way its exports claim.
run "build"     npm run build

# --- Memory and standards health ----------------------------------------------------------
# Two checks that watch the memory system rather than the build. They cost milliseconds and
# both cover a failure that is silent by nature. Added by /apply-standards on 2026-08-21;
# verify.sh has no generated region, so nothing else would ever have copied them in.

# Is this project still running the current standard?
#
# Nothing else asks. The instruction block in CLAUDE.md is generated, and a project drifts from
# it the moment the standard changes — quietly, because every build check stays green.
#
# It exits 0 on warnings, which is what this repo gets: it keeps its memory in docs/ rather than
# .dev-standards/, deliberately and per ADR-0053. Those three warnings are expected. Read them,
# do not act on them, and do not run migrate-memory.sh --apply.
#
# Skipping when the checkout is absent is deliberate and sets no failure: a CI runner has no
# reason to carry the standards repo, and a project is not unhealthy because of where it builds.
standards_root="${DEV_STANDARDS_HOME:-$HOME/.local/share/dev-standards}"
if [[ -x "$standards_root/scripts/check-standards.sh" ]]; then
  run "standards" "$standards_root/scripts/check-standards.sh" .
else
  skip "standards" "no dev-standards checkout at $standards_root, so drift was not checked"
fi

# Did two parallel worktrees take the same record number?
#
# Both see the same directory, neither sees the other's uncommitted file, so both take the next
# free number. Git then merges 0007-a.md beside 0007-b.md without complaint — different
# filenames, no conflict. Records are immutable, so a collision noticed late is permanent.
#
# ── Why this one carries a baseline, which the template's version does not ──
#
# Twelve numbers were already doubled up when this check was added, every one of them a real
# parallel-worktree collision that was found late and left on purpose: records are immutable and
# renumbering one means rewriting every cross-reference in the other files that point at it.
# STATE.md and docs/README.md both say so at the collisions they describe.
#
# Failing on those forever would teach exactly one lesson, which is to stop reading the output.
# So they are listed here as accepted, and anything NOT on the list fails — which is the case
# the check is actually for: the collision you just created, today, in the other worktree.
#
# Adding a number here is not a way to dismiss a fresh collision. If yours is new, renumber it;
# the other one is already on the main branch.
ACCEPTED_COLLISIONS="docs/decisions:0014 docs/decisions:0021 docs/decisions:0023 \
docs/decisions:0030 docs/decisions:0034 docs/decisions:0035 docs/decisions:0042 \
docs/decisions:0046 docs/decisions:0048 docs/decisions:0049 docs/decisions:0050 \
docs/feedback:0007"

# shellcheck disable=SC2329  # invoked indirectly, through `run` below.
record_numbers() {
  local found=0 dir dupes number clashing
  for dir in .dev-standards/decisions .dev-standards/feedback docs/decisions docs/feedback; do
    [[ -d "$dir" ]] || continue
    dupes="$(find "$dir" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.md' -exec basename {} \; \
      | cut -d- -f1 | sort | uniq -d)"
    [[ -n "$dupes" ]] || continue
    while IFS= read -r number; do
      [[ -n "$number" ]] || continue
      case " $ACCEPTED_COLLISIONS " in
        *" $dir:$number "*) continue ;;
      esac
      clashing="$(find "$dir" -maxdepth 1 -name "$number-*.md" -exec basename {} \; | sort | tr '\n' ' ')"
      printf '%s/ has %s twice — %s\n' "$dir" "$number" "$clashing"
      found=1
    done <<< "$dupes"
  done
  if [[ "$found" -eq 1 ]]; then
    printf 'Two worktrees took the same number. Renumber yours; the other is already on the main branch.\n'
    return 1
  fi
  return 0
}
run "record numbers" record_numbers

# ------------------------------------------------------------------------------------------
if [[ "$status" -eq 0 ]]; then
  printf '\nAll checks passed.\n'
else
  printf '\nChecks failed.\n'
fi
exit "$status"
