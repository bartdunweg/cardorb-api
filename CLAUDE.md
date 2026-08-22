<!-- STANDARDS:BEGIN v0.26.0 — generated from dev-standards. Do not edit by hand. -->

## Language

- **YOU MUST write everything that lands on disk in English** — files, folder names, commit
  messages, code comments, documentation, PR and issue text. Read any language, write English.
- **Answer in the language the user writes in** — the chat only; every file you write is English.
- **Explain simply, in bullets.** Short, common words and one idea per sentence — write as if the
  reader is smart but new to the topic. Say the consequence first, then the thing.
- **Never invent a word for something.** No metaphors of your own making, no house vocabulary,
  no shorthand borrowed from this repository's files. Use the ordinary word, even if it is
  longer. A term the reader has not met needs its meaning in the same sentence, every time —
  not the first time only. Default to bullets and small tables over prose.
- The product's user-facing copy may be in any language; everything internal is English.

## How you close a response

**Every response ends with a summary block. Nothing comes after it**, so the user never scrolls
up to find out what happened.

- **Heading and contents in the language you are answering in.**
- Point-by-point, scannable. No prose paragraphs.
- When something changed, include a two-column before/after table.
- Assumptions and open questions go inside this block, not scattered through the answer.

## How you operate

- **Ask about the what and the how; decide only the trivial.** Where there is a real choice —
  what to build, or the approach, structure, or library for it — say plainly what you mean to do,
  then ask first: a few short multiple-choice questions, up front, and the same at each plan and
  each real change; defining it through questions is faster and builds better. Decide silently
  only what has no real alternative — formatting, an obvious name — then note it and report it.
  Always stop for destructive or irreversible operations, real money, or production.
- **Batch, never interrupt.** One upfront batch or a checkpoint, never scattered
  mid-task; anything you did not ask, you decided — record it in the closing summary.
- **Reach for subagents on purpose.** Before a broad search, a sweep across many files, or two
  jobs that do not depend on each other, ask which agent fits and dispatch it — in parallel where
  they share no state. Name the agent and the skill it should run, in one line, then send it.
  Waiting to be asked is the failure; a single known file is the only case that stays inline.
- **Look backwards only when you are the one starting.** Deciding yourself to change existing
  code? First find out why it is the way it is — `git log -S` on the line, and the rule in
  `CONVENTIONS.md` if one covers it. Asked directly for something? Build it; do not go digging
  for why it was once done differently.

## Rules

- **`CONVENTIONS.md` holds the rules that apply now.** It is the only binding source, and it is
  a living file: a rule is rewritten or deleted the moment it stops being true. There is no
  archive of past rules, and nothing outside this file may be quoted as binding.
- **A request outranks a rule.** Where the request departs from one, say so in one sentence —
  *this departs from R-STRUCT-001* — and then carry it out. No investigation, no alternatives.
- **Past reasoning lives in git.** `git log -p CONVENTIONS.md` shows when a rule changed and why.
  That is the whole history mechanism, and it is deliberately not in the read path.
- **If the new approach becomes the norm, update the rule** at the end, in the summary.
- **A rule the code structurally ignores is a bug in one of the two.** Never decide which alone:
  add it to `## Open` in `STATE.md`.

## Memory system

This repo keeps its own memory. **IMPORTANT: you maintain it as part of doing the work.**

| Trigger | Action |
|---|---|
| User reacts, criticises, or states a preference | Use the `record-rule` workflow before acting |
| A real choice is made, or a norm needs writing down | Use the `record-rule` workflow |
| A rule stops being true | Rewrite it or delete it. Never leave it standing as history |
| A user-visible change ships | A fragment in `changelog.d/`, never a hand-edit of the changelog — and refresh any outward-facing text it makes stale: README opening, repository description and topics. Outward text is derived from what is already public, never from `STATE.md` or a brief. A project that ships no user-visible releases has neither file, and that is correct — do not create them |
| Session starts on an existing project | Run `catch-up` — `STATE.md` here, then every sibling worktree's, then unmerged branches |
| Session ends | Run `handoff`, unannounced. A sibling workspace can only read what you wrote down |
| A build or code change is complete | Run `scripts/verify.sh`, then `build-quality` |

**Definition of Done:** `scripts/verify.sh` exits 0 + changelog entry if user-visible + a rule
written, updated or deleted where the work settled one + `STATE.md` updated + a `build-quality`
report for this project's platform, where every domain carries evidence or is reported
`not measured` + every written artefact in English + a closing summary block listing the
assumptions.

**A `pass` without evidence is not a pass.** Report `not measured` instead and say what would
have produced the evidence. A task without a memory write is not done.

**`Visibility` decides how freely memory is written.** Where it is `private`, write bluntly.
Where it is `public` or `may become public`, write nothing you would not publish on this
project's own website — git history is public the moment the repository is, so there is no
later redaction. Record the shape instead: *the budget ceiling was reached*, not the figure.

## Rules that are easy to get wrong

- A rule carries one sentence of *why*. If the why does not fit in one sentence, the rule is wrong.
- Never invent a reason. Where the evidence is silent, write `Why: unknown` and leave it there.
- Creating new shared files is fine; **editing an existing shared file is the one case
  where you flag it first**, because a parallel worktree is probably editing it too.
- Before choosing a skill, an agent, a library, or an MCP, read
  `~/.local/share/dev-standards/references/`: `skill-routing.md` says which skills a request
  should wake and `standard-agents.md` names the agents you may send, plus libraries and MCPs.
- On React or Tailwind work, search Untitled UI (MCP) before writing a component or icon; Context7 if it is down.

<!-- STANDARDS:END -->

<!-- PRODUCT:BEGIN — product-specific. Edit freely; never overwritten by /apply-standards. -->

# Card Orb

A Pokémon card collection (~1,600 cards) kept in Postgres (Supabase), matched against
three card catalogues, priced, and served as an API that a web tool and an iOS app
both read.

- Profile: production
- Platform: web
- Stage: live
- Users: one owner (single-passcode API), public read access at cardorb.com
- Visibility: private (the repository; the deployed site and its API are public)

`Platform: web` is what `build-quality` reads to decide which domains apply, and it is
the platform of *this repository* — a Next.js app on Vercel. The iOS client lives in
`bartdunweg/cardorb-ios` and is a separate repo with its own standards; this one only
serves it an API.

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm run test` (vitest)
- Lint: `npm run lint` (eslint, `--max-warnings 0`)
- Typecheck: `npm run typecheck`
- All checks: `npm run check` (typecheck + test + lint)

## Architecture

Everything is under `src/`. See @CONVENTIONS.md for the full layout and the rules
that hold it together.

- `src/app/` — routes only: `api/v1/*` (public collection API), the signed-in
  `(app)` group, auth pages. Route-local UI lives in that route's `_components/`
- `src/features/<domain>/` — UI and hooks owned by one domain (`collection`, `account`)
- `src/components/shared/` — UI with no domain; `base|application|foundations` are vendored Untitled UI
- `src/lib/core/` — matching a hand-kept collection against TCGdex, Limitless, pokemontcg.io;
  artwork resolution; Cardmarket pricing
- `src/lib/api/` — request guards (e.g. `guard.ts` reads `x-forwarded-host` for `sameOrigin()`)
- `src/lib/storage/` — persistence helpers
- `src/styles/theme.css` — every design value, and the only place one may be written
- `supabase/` — auth/session backing store, migrations

## Product-specific rules

- @AGENTS.md — Next.js breaking-changes notice, re-generated by `next dev`; read before
  writing code that touches Next.js APIs.
- Deployed on Vercel with DNS on Cloudflare in DNS-only mode (not proxied) — proxying would
  break `x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` depends on. Do not
  suggest enabling the Cloudflare proxy.
- `NEXT_PUBLIC_SITE_URL` should always be set explicitly in production, and it must be set in
  Vercel's **Build** environment. Because the name starts with `NEXT_PUBLIC_`, Next inlines it
  at build time: setting it only at runtime silently does nothing, and changing it needs a
  redeploy. Without it, `SITE_URL` falls back to `VERCEL_PROJECT_PRODUCTION_URL` — the stable
  project URL, not the per-deployment one — so canonicals stay on a real domain but not
  necessarily the custom one. (`lib/core/config.ts` avoids `VERCEL_URL` deliberately, for
  exactly the per-deployment reason an earlier version of this line got wrong.)
- `/api/v1/collection` and `/api/v1/cards/:tcgId` both call `authorise()` and refuse an
  anonymous caller. They used to be open, and this line used to say so; they were closed when
  `/user/<name>` shipped, and each route's docstring says why. The genuinely open, unkeyed
  routes are the three under `/api/v1/public/<username>/`, which serve the public profile —
  those are open on purpose, carry no prices, and each has its own rate limiter. Do not "fix" the guard back off `/api/v1/collection`.

## Components

They live in `CONVENTIONS.md` as R-UI-001 through R-UI-008 — one list, one place.

## Where things live

- Rules that apply now: @CONVENTIONS.md — the only binding source, and the whole of it.
- Current state: @STATE.md
- Why a rule reads the way it does: `git log -p CONVENTIONS.md`. There is no archive.
- Changelog fragments: `changelog.d/`, collected into `CHANGELOG.md` by `npm run changelog`.
- Open data worklists and rollback files: `docs/*.md`, `docs/*.json` — these are rows in the
  live database that still need a hand, and the before-state of past backfills. Not history.

<!-- PRODUCT:END -->
