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

# The direction reversed with the CSS rebuild (ADR-0093): styles/theme.css is the source now,
# and lib/design/theme-values.generated.ts is what is written — the handful of colours the web
# manifest, viewport.themeColor and the two OG images need, none of which can read a stylesheet.
# --check fails if the committed file no longer matches theme.css, which is how a token edit
# that was never regenerated gets caught before it reaches a page.
# --check, never --write. A verify script that fixes what it finds reports a pass on a
# working tree it just changed, which is how an unreviewed reformat rides along with a
# feature commit. `npm run format` is the one that writes; this one only judges.
#
# Scope is set by .prettierignore, and the argument is there: this formats code, not
# prose. Every .md in the repo is hand-wrapped and Prettier would reflow it.
run "format"    npx prettier --check .
run "tokens"    node scripts/extract-theme-values.mjs --check
# The changelog is generated from changelog.d/ and used to only claim it was.
# This is what makes the claim true: a fragment added without collecting it turns
# the run red, which is the whole reason the collector exists rather than a note
# asking people to remember.
run "changelog" node scripts/collect-changelog.mjs --check
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
# each covers a failure that is silent by nature. Added by /apply-standards on 2026-08-21 and
# rewritten on 2026-08-22; verify.sh has no generated region, so nothing else would ever have
# copied them in.

# Is CONVENTIONS.md still shaped, and still looked at?
#
# This used to be a `skip` naming three reasons. Two of them are gone: every ID is now bare
# rather than bold, `Intent` is retired, and the heading registers are a bullet list instead of
# a table the check read as malformed rule IDs.
#
# The third is not ours to settle, so the count clause of the standard's block is deliberately
# left out here. dev-standards v0.26.0 contradicts itself about it:
#   - templates/CONVENTIONS.md.template says "There is no rule-count ceiling. Freshness is the
#     brake, not size."
#   - templates/verify.sh.template fails above 15 rules.
# This project has 47 and follows the template's documented rule. See `## Open` in STATE.md;
# put the count clause back the moment the standard agrees with itself.
#
# What is enforced below: the ID format, the two permitted enforcement values, and a
# last-reviewed date no older than 90 days. Copied from the standard's template otherwise.

# shellcheck disable=SC2329  # invoked indirectly, through `conventions` below.
rule_rows() {
  grep '^| ' CONVENTIONS.md | grep -v '^| ID | Rule |' | grep -v '^|[- |]*$' || true
}

# Strips leading and trailing whitespace without forking. Result lands in $_trimmed.
_trimmed=""
# shellcheck disable=SC2329  # invoked from `conventions` below.
trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  _trimmed="${v%"${v##*[![:space:]]}"}"
}

# shellcheck disable=SC2329  # invoked indirectly, through `run` below.
conventions() {
  local ok=0 id enf line reviewed epoch age
  [[ -f CONVENTIONS.md ]] || return 0
  while IFS= read -r line; do
    IFS='|' read -r _ id _ enf _ <<< "$line"
    trim "$id";  id="$_trimmed"
    trim "$enf"; enf="$_trimmed"
    [[ "$id" =~ ^R-[A-Z]+-[0-9]{3}$ ]] || { printf 'Malformed rule ID: %s\n' "$id"; ok=1; }
    if [[ "$enf" != "reviewed" && ! "$enf" =~ ^enforced\ —\ .+ ]]; then
      printf '%s: enforcement is "%s" — use "reviewed" or "enforced — <what enforces it>".\n' "$id" "$enf"
      ok=1
    fi
  done < <(rule_rows)
  reviewed="$(sed -n 's/^last-reviewed: *//p' CONVENTIONS.md | head -n 1)"
  epoch="$(date -j -f '%Y-%m-%d' "$reviewed" +%s 2>/dev/null || date -d "$reviewed" +%s 2>/dev/null || true)"
  if [[ -z "$epoch" ]]; then
    printf 'CONVENTIONS.md has no usable "last-reviewed: YYYY-MM-DD" line.\n'
    ok=1
  else
    age=$(( ( $(date +%s) - epoch ) / 86400 ))
    if [[ "$age" -gt 90 ]]; then
      printf 'CONVENTIONS.md was last reviewed %s days ago, ceiling 90.\n' "$age"
      printf 'Walk the list and retire what is dead. Moving only the date is the failure.\n'
      ok=1
    fi
  fi
  return "$ok"
}
if [[ -f CONVENTIONS.md ]]; then
  run "conventions" conventions
else
  skip "conventions" "no CONVENTIONS.md — run apply-standards"
fi
# Is this project still running the current standard?
#
# Nothing else asks. The instruction block in CLAUDE.md is generated, and a project drifts from
# it the moment the standard changes — quietly, because every build check stays green.
#
# It exits 0 on warnings. This project no longer keeps decision or feedback records at all —
# the rules live in CONVENTIONS.md and the reasoning in git history — so the standard's memory
# warnings are expected and are not findings. Do not run migrate-memory.sh --apply.
#
# Skipping when the checkout is absent is deliberate and sets no failure: a CI runner has no
# reason to carry the standards repo, and a project is not unhealthy because of where it builds.
standards_root="${DEV_STANDARDS_HOME:-$HOME/.local/share/dev-standards}"
if [[ -x "$standards_root/scripts/check-standards.sh" ]]; then
  run "standards" "$standards_root/scripts/check-standards.sh" .
else
  skip "standards" "no dev-standards checkout at $standards_root, so drift was not checked"
fi

# ------------------------------------------------------------------------------------------
if [[ "$status" -eq 0 ]]; then
  printf '\nAll checks passed.\n'
else
  printf '\nChecks failed.\n'
fi
exit "$status"
