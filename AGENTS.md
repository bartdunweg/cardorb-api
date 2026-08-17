<!-- DEV-STANDARDS:BEGIN v0.5.3 — generated from dev-standards. Do not edit by hand. -->

# Codex adapter

Before planning, editing, reviewing, or running commands, read the repository-root
`CLAUDE.md`. Treat its standards and product-specific instructions as binding for this
repository. It is the canonical project instruction file shared with Claude Code.

When a request matches an installed shared workflow, use it: `apply-standards` for
onboarding or refreshing standards, `log-feedback` before acting on user feedback, and
`record-decision` for non-obvious choices. Use natural-language requests when a slash
command is unavailable.

After every build or code change, run `./scripts/verify.sh` and then `build-quality` before
declaring the work complete. `build-quality` reads `Platform:` from `CLAUDE.md` and covers the
domains that platform requires. Every domain carries evidence — a command and its exit code, a
measurement, a trace, or a screenshot. A domain with no evidence is reported `not measured`,
never `pass`.

<!-- DEV-STANDARDS:END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
