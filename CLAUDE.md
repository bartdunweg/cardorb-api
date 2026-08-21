<!-- STANDARDS:BEGIN v0.22.0 — generated from dev-standards. Do not edit by hand. -->

## Language

- **YOU MUST write everything that lands on disk in English** — files, folder names, commit
  messages, code comments, documentation, PR and issue text. Read any language, write English.
- **Answer in the language the user writes in** — the chat only; every file you write is English.
- **Explain simply, in bullets.** Short, common words and one idea per sentence — write as if the
  reader is smart but new to the topic (ELI5 / simplified technical English). Avoid jargon; when a
  technical term is unavoidable, say what it means. Default to bullets and small tables over prose.
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
- **Look backwards first.** Before changing existing code, find out why it is the way it
  is — search the decision records, then `git log -S`. If no rationale exists, write one
  before you change it. Reasoning disappears the moment you overwrite the code.

## Memory system

This repo keeps its own memory. **IMPORTANT: you maintain it as part of doing the work.**

| Trigger | Action |
|---|---|
| User reacts, criticises, or states a preference | Use the `log-feedback` workflow before acting |
| A non-obvious choice between real alternatives | Use the `record-decision` workflow |
| A user-visible change ships | A fragment in `changelog.d/`, never a hand-edit of the changelog — and refresh any outward-facing text it makes stale: README opening, repository description and topics. Outward text is derived from what is already public, never from `STATE.md`, a brief, or a record. A project that ships no user-visible releases has neither file, and that is correct — do not create them |
| Session starts on an existing project | Read `STATE.md` first |
| Session ends | Update `STATE.md` so the next session starts oriented |
| A build or code change is complete | Run `scripts/verify.sh`, then `build-quality` |

**Definition of Done:** `scripts/verify.sh` exits 0 + changelog entry if user-visible +
decision record if a real choice was made + prompting feedback marked `addressed` +
`STATE.md` updated + a `build-quality` report for this project's platform, where every domain
carries evidence or is reported `not measured` + every written artefact in English + a closing
summary block listing the assumptions.

**A `pass` without evidence is not a pass.** Report `not measured` instead and say what would
have produced the evidence. A task without a memory write is not done.

**`Visibility` decides how freely memory is written.** Where it is `private`, write bluntly —
a carefully-worded feedback record is worthless, and that candour is the whole value. Where it
is `public` or `may become public`, write nothing you would not publish on this project's own
website: records are immutable and git history is public the moment the repository is, so there
is no later redaction. Record the shape instead — *the budget ceiling was reached*, not the
figure; *a customer on the enterprise plan*, not the name. **If keeping a record honest and
keeping it publishable conflict, say so and stop**; the answer is to move the memory somewhere
private, not to write a diplomatic record.

## Rules that are easy to get wrong

- Decision records are immutable. Supersede, never rewrite.
- Feedback is quoted verbatim before it is interpreted.
- Reconstructed history is labelled `reconstructed: true` with a confidence level.
  Never present a guessed rationale as fact.
- Creating new shared files is fine; **editing an existing shared file is the one case
  where you flag it first**, because a parallel worktree is probably editing it too.
- Before choosing a skill, a library, or an MCP, read `~/.local/share/dev-standards/references/`:
  `skill-routing.md` says which skills a request should wake, plus libraries, MCPs, and baselines.
- On React or Tailwind work, search Untitled UI (MCP) before writing a component; Context7 if it is down.

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

- `app/` — Next.js routes: `api/v1/*` (public collection API), `cards/`, `user/`, auth pages
- `lib/core/` — matching a hand-kept collection against TCGdex, Limitless, pokemontcg.io;
  artwork resolution; Cardmarket pricing
- `lib/api/` — request guards (e.g. `guard.ts` reads `x-forwarded-host` for `sameOrigin()`)
- `lib/storage/` — persistence helpers
- `supabase/` — auth/session backing store, migrations

## Product-specific rules

- @AGENTS.md — Next.js breaking-changes notice, re-generated by `next dev`; read before
  writing code that touches Next.js APIs.
- Deployed on Vercel with DNS on Cloudflare in DNS-only mode (not proxied) — proxying would
  break `x-forwarded-host`, which `sameOrigin()` in `lib/api/guard.ts` depends on. Do not
  suggest enabling the Cloudflare proxy.
- `NEXT_PUBLIC_SITE_URL` should always be set explicitly in production; without it `SITE_URL`
  falls back to Vercel's per-deployment URL, which breaks canonicals/sitemap/robots.
- Read access to `/api/v1/collection` and `/api/v1/cards/:tcgId` is intentionally open (no
  key) because the collection itself is public; only writes require `CARDS_TOKEN`.

## Where things live

- Docs map: @docs/README.md
- Decisions: @docs/decisions/
- Feedback: `docs/feedback/`
- Changelog fragments: `docs/changelog.d/` (the standard says `changelog.d/`; here it lives
  under `docs/`, which is this repo's memory root and is not published anywhere)

<!-- PRODUCT:END -->
