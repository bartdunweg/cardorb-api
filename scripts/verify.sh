#!/usr/bin/env bash
# One command that runs what CI runs. Edit the command blocks freely; keep the contract.
#
# CONTRACT: this is the single entry point that answers "is this project healthy?".
# Exit 0 means every check passed. Any non-zero exit means it did not.
#
# It exists so an agent never has to know whether this project uses pnpm, gradlew,
# xcodebuild, or dotnet. One command, one exit code. CLAUDE.md points here.
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
# Split rather than one `pnpm run check`, deliberately. That script chains with && and stops
# at the first failure, which is the opposite of what this file promises: every check runs so
# one pass shows every problem. The commands are the same ones `pnpm run check` composes, so
# the two cannot drift.

# --check, never --write. A verify script that fixes what it finds reports a pass on a
# working tree it just changed, which is how an unreviewed reformat rides along with a
# feature commit. `npm run format` is the one that writes; this one only judges.
#
# Scope is set by .prettierignore, and the argument is there: this formats code, not
# prose. Every .md in the repo is hand-wrapped and Prettier would reflow it.
run "format"    npx prettier --check .
# The changelog is generated from changelog.d/ and used to only claim it was.
# This is what makes the claim true: a fragment added without collecting it turns
# the run red, which is the whole reason the collector exists rather than a note
# asking people to remember.
run "changelog" node scripts/collect-changelog.mjs --check
run "typecheck" pnpm run typecheck
run "test"      pnpm run test
run "lint"      pnpm run lint

# The build is not redundant next to typecheck. It is the only step that parses the CSS, and a
# broken selector has reached main that way before with tests and typecheck both green — the
# same reason .github/workflows/check.yml runs it. It is also the only step that would catch a
# route which cannot be rendered the way its exports claim.
run "build"     pnpm run build

# ------------------------------------------------------------------------------------------
if [[ "$status" -eq 0 ]]; then
  printf '\nAll checks passed.\n'
else
  printf '\nChecks failed.\n'
fi
exit "$status"
