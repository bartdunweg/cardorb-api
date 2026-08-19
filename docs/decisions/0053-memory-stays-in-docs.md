---
id: ADR-0053
title: The memory stays in docs/, and does not move to .dev-standards/
status: accepted
date: 2026-08-19
scope: repo
deciders: [Bart]
superseded-by: null
amends: ADR-0000
tags: [standards, memory-system, docs, repository-layout]
---

# The memory stays in `docs/`, and does not move to `.dev-standards/`

Decided while refreshing the shared standards from v0.5.3 to v0.11.0. The new
version puts a repository's memory in `.dev-standards/` instead of `docs/`, and
ships `scripts/migrate-memory.sh` to move it. This repository keeps `docs/`.

## Context and problem statement

`docs/` is a publishing namespace by convention. GitHub Pages serves from it,
and MkDocs, Docusaurus, VitePress and Jekyll all treat it as the content root.
The upstream standard moved the memory out of it because decision records and
verbatim feedback should not be one config change away from a public URL.

That reasoning is sound in general. The question is whether it applies here.

## Decision

Keep the memory where it is: `docs/decisions/`, `docs/feedback/`,
`docs/CHANGELOG.md`, `docs/changelog.d/`. Do not run the migration script.

`CLAUDE.md`'s PRODUCT region now spells out the mapping, because the generated
standards block above it says `changelog.d/` without the `docs/` prefix.

## Why

- **Nothing publishes `docs/` in this repository.** No `mkdocs.yml`, no
  Docusaurus, VitePress or Jekyll config, and `gh api repos/bartdunweg/cardorb/pages`
  returns 404 — GitHub Pages is not enabled. The hazard the standard guards
  against does not exist here today.
- **The repository is private** (`gh repo view --json isPrivate` → `true`), and
  the npm manifest is `"private": true`, so `npm publish` cannot ship these
  files either.
- **The cost of moving is real and one-sided.** Fifty-odd decision records are
  referenced by path from `docs/README.md`, from `STATE.md`, from `CLAUDE.md`,
  and from the bodies of the records themselves. Parallel worktrees are open on
  this repository at any time; a directory rename is the worst possible thing to
  hand them.
- The upstream skill anticipates exactly this and says a repository already
  keeping its memory in `docs/` is left alone — the move is the owner's call.

## Alternatives considered

- **Run `scripts/migrate-memory.sh --apply`.** Aligns with the standard and
  removes the future hazard outright. Rejected for now: it breaks every path
  reference in the repository's own memory and collides with parallel
  worktrees, to close a risk that requires someone to first enable Pages or add
  a docs generator.
- **Move only `feedback/` out, keep `decisions/` public-shaped.** Rejected as
  the worst of both: two memory roots, and the map in `docs/README.md` stops
  being the map.

## Consequences

- `check-standards.sh` will warn about the layout on every run. That warning is
  expected here and is not a finding.
- **If GitHub Pages is ever enabled, or a docs generator is added, this record
  is void and the migration must run first.** That is the trigger to watch for.
- Anyone reading the generated standards block will see `changelog.d/` and must
  read the PRODUCT region below it for the real path.
