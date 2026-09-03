# Agent adapter

Read the repository-root `CLAUDE.md` before planning, editing, reviewing or running
commands. It is the canonical project instruction file; this file only points at it.
Path-scoped rules live in `.claude/rules/`.

Before calling a change done, run `./scripts/verify.sh` and read its exit code: `0` whole,
`1` broken, `2` nothing failed but a check could not run. A `2` is not a pass.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
