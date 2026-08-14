# 0000 — Adopt the dev-standards memory system

- Status: accepted
- Date: 2026-08-14

## Decision

Card Orb adopts the shared dev-standards memory system: a `STANDARDS` region in
`CLAUDE.md` (generated, not hand-edited), a `PRODUCT` region beneath it for
project-specific rules, an `AGENTS.md` adapter pointing Codex at `CLAUDE.md`, and a
`docs/` tree (`decisions/`, `feedback/`, `CHANGELOG.md` + `changelog.d/`) for durable
project memory.

## Profile

Card Orb runs the **product** profile: it is deployed to production on Vercel
(`cardorb.com`), has a real DNS/Cloudflare setup, a public read API, and existing
users of that API (a web tool and an iOS app). This is not an experiment.

## Why

- `CLAUDE.md` previously contained only `@AGENTS.md`, importing an auto-generated
  Next.js breaking-changes notice. That notice is preserved via an explicit
  `@AGENTS.md` reference in the new `PRODUCT` region so it keeps loading.
- `AGENTS.md` previously held only the `next dev`-generated Next.js block (regenerated
  automatically; see `node_modules/next/dist/server/lib/generate-agent-files.js`). The
  Codex adapter region was prepended above it, leaving that block untouched.
- No prior `docs/` structure existed, so it was created fresh rather than migrated.

## Reconstructing history

This repo has 58 commits of real history (`git log`). A future `backfill` run could
reconstruct `docs/decisions/` and `docs/feedback/` entries from that history and from
PR descriptions; that was not done here — out of scope for initial setup, and not
requested.
