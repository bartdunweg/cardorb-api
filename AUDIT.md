# Release audit

Diagnosis only. Nothing was fixed. Every claim below carries a command output or
a `file:line`; what I could not check is in section 5 rather than left silent.

Run in a session that did none of the migration work and read no previous report
before forming these findings. The earlier `AUDIT.md`, `UI-ADOPTIE.md` and
`EINDCHECK.md` all state that they ran in the session that wrote the code they
judge. They are recoverable with `git show 2b12ef3:AUDIT.md`.

> **Status, 2026-08-22, after this audit was written.**
>
> **Fixed:** 1, 2, 4, 6, 7, 8, 9. **Still open:** 3 (changelog), 5 (dead type
> tokens), 10, 11, 12, 13, 14, and the `tracking-[…]` finding in `EINDCHECK.md`.
>
> The diagnosis below is left exactly as written rather than edited down to
> match, because a report that quietly rewrites itself is worth less than one you
> can check against the commit.
>
> One correction, which is why this note is not just a tick list: **finding 8 was
> worse than it says.** `collection.ts` did not merely lack a warning — it
> actively claimed "the cron revalidates this tag itself after it writes, so a
> fresh week's prices are on the dashboard immediately". It never has. The
> comment is now truthful; the one-line wiring, if you want it to be immediate
> after all, is still yours to decide.

---

## 1. Verdict

**READY, subject to 4 fixes.** Nothing here is broken in production and nothing
leaks. What I found is a different shape: four places where a check, a document
or a comment claims something that is not true of the code. Each one costs the
next person the time they would have saved by trusting it.

No blocking findings.

---

## 2. Findings

| # | Severity | Finding | Evidence | Consequence | Fix | Size |
|---|---|---|---|---|---|---|
| 1 | Before release | `Modal.tsx` says its focus predicate is tested. There is no such test, and there are no component tests at all. | `src/components/shared/Modal.tsx:52` says "see Modal.test.ts". `find src -name 'Modal.test.*'` → nothing. 43 test files, none render a component. | The keyboard trap documented at `Modal.tsx:23-47` — every filter and view sheet unreachable below 1000px, which includes 200% zoom — is a WCAG 2.1.2 failure that shipped once and has no regression test. `FOCUSABLE` and `isVisible` are exported for testing and nothing else (`knip`). | Write `Modal.test.ts` over the two exported predicates. They are pure functions; no renderer needed. | S |
| 2 | Before release | R-API-004 is marked `Enforced`, but its test cannot see either route that breaks it — nor an uncapped route written the same way. | `CONVENTIONS.md` R-API-004. `body.test.ts:47-48` matches `req.json()` and exempts on `readJsonBody\|MAX_BODY_BYTES`. `cards/route.ts:39` and `collection/items/[id]/route.ts:55` both use `await req.text()` and their own `MAX_BODY_BYTES`. 2 of 12 body-reading routes. | Two escapes at once: `req.text()` never matches `reads`, and a local `MAX_BODY_BYTES` satisfies `caps`. A **new** route using `req.text()` + `JSON.parse` with no cap at all is also invisible. `body.ts:13` says the helper exists "rather than in a third copy" — the two copies it was extracted from were never migrated. | Move both routes to `readJsonBody()`, then widen the regex to `req.(json\|text)()` and drop the `MAX_BODY_BYTES` escape. | M |
| 3 | Before release | The changelog claims to be generated and no generator exists. | `docs/CHANGELOG.md:3` — "Generated from fragments in `changelog.d/`. Do not hand-edit". File is 8 lines and stops at 2026-08-14. `ls docs/changelog.d \| wc -l` → **94**. No collector in `package.json`, `scripts/`, or `.github/workflows/`. | 8 days and 92 entries of shipped user-visible work have never reached the changelog, and `CLAUDE.md`'s memory table instructs every future change to add another fragment to a pile nothing drains. | Write the collector, or delete `CHANGELOG.md` and say the fragments are the record. Either is fine; the present state claims one and does the other. | S |
| 4 | Before release | No error boundary on the public surface. | `find src/app -name 'error.tsx' -o -name 'global-error.tsx'` → only `(app)/error.tsx` and `(app)/collection/browse/error.tsx`. No `src/app/error.tsx`, no `global-error.tsx`. | Every route outside `(app)` — the landing page, `/brand`, `/privacy`, `/terms`, `/login`, `/signup` and `/user/[username]` — falls back to Next's default error page. `/user/[username]` is the page shared links point at. | Add `src/app/error.tsx`. `RouteError.tsx` already exists and is what `(app)/error.tsx` renders. | S |
| 5 | Later | Three type-scale tokens have no consumer. | `--text-display-lg\|xl\|2xl` at `theme.css:64-74`. Consumers outside `theme.css` and tests: **0, 0, 0**. Compare `display-xs` (14), `display-md` (4), `display-sm` (2). | They are in neither heading register in `CONVENTIONS.md` and in neither out-of-table carve-out, so the next person picks `text-display-xl` believing it is sanctioned and lands outside both registers. | Either delete them, or add one line to R-STYLE-004 saying the display scale is vendored whole from Untitled UI and runs to `2xl`. Deciding is the fix; both answers are defensible under R-STYLE-006. | S |
| 6 | Later | `lib/core/motion.ts` describes a product that is not this one. | Header: "mirroring the CSS tokens in `app/styles/tokens.css`" — that path does not exist. `SPRING_BUBBLE` documents "chat bubble entrance… typing dots"; `SPRING_PILL` documents a "connect list highlight". Neither exists here. `SPRING_PILL`, `SPRING_BUBBLE`, `EASE_SMOOTH`: 0 consumers (`knip`). Only `Modal.tsx` imports the file. | Half the file is dead and the live half is documented against a codebase that is not this one. A reader looking for the motion language finds a broken file reference first. | Delete the three unused exports and the two invented use-cases; point the header at `src/styles/theme.css`. | S |
| 7 | Later | Config names three files that do not exist. | `src/hooks/use-breakpoint.ts` — deleted in `c38dacf` — is still listed in `eslint.config.mjs:97`, `.prettierignore`, `tsconfig.json:52` and `tsconfig.vendored.json`. `.prettierignore` also names `app/styles/tailwind.generated.css`, which does not exist. | Harmless today, with one trap: a **first-party** `use-breakpoint.ts` created later lands silently exempt from lint, prettier and the four strict flags. R-UI-008's "goes in all four" ritual now has a phantom worked example. | Delete the four `use-breakpoint.ts` entries and the `tailwind.generated.css` line. | S |
| 8 | Later | Two cache-tag comments have swapped truth. | `value-snapshot.ts:36` — "Nothing invalidates this today" — but `cron/snapshot/route.ts:122` calls `revalidateTag(valueHistoryTag(userId))`. Meanwhile `cardPricesTag` (`collection.ts:265`) is applied to a cache entry at `:283` and **never** passed to `revalidateTag` anywhere. | The comment that warns you describes the tag that is fine; the tag that actually has no invalidation carries no warning. Prices refresh only on the 3600s timer, which may well be intended — but nothing says so. | Move the paragraph to `cardPricesTag` and update it, or wire the invalidation. | S |
| 9 | Later | `src/utils/**` is exempted as a directory, though R-UI-008 requires per file. | `eslint.config.mjs:96`, `.prettierignore`, `tsconfig.json:54` all use `src/utils/**`. `src/hooks/` is correctly per-file. `src/utils/cx.ts` is substantially first-party — a 25-line rationale and an `extendTailwindMerge` built from `@/lib/design/theme-values.generated`. | A first-party file carrying the class-merge tie-break — which its own comment says was already shipping a live bug — is unlinted, unformatted, and typechecked only under the relaxed vendored config. | Name `is-react-component.ts` per file, as `src/hooks/` already does, and let `cx.ts` back under the project's own rules. | S |
| 10 | Later | The feature-boundary lint is enumerated per pair, so a third feature is unguarded. | `eslint.config.mjs:126-162` — one block naming `collection`, one naming `account`, each blocking the other by name. A `features/pricing/` would match no block. | R-STRUCT-001 reads as structural and is actually a hand-maintained pair list. `CONVENTIONS.md`'s `## Open` already flags three features as the point where `lib/core` gets ambiguous; this is the same cliff, one file over. Zero violations today — I checked every import. | Nothing now. When feature three arrives, replace both blocks with one `zones` rule. Worth a line in `## Open`. | — |
| 11 | Later | Body limits are named in bytes and measured in UTF-16 code units. | `body.ts:76` `raw.length > limit`; same at `cards/route.ts:41` and `items/[id]/route.ts:56`. Constants are `MAX_BODY_BYTES` and `BODY_LIMIT`. | A body of multibyte text passes a cap up to ~3× its named byte figure. Bounded and not exploitable at these limits, but the name and the behaviour disagree. | `new TextEncoder().encode(raw).length`, or rename the constants. | S |
| 12 | Later | `poke-holo.css` holds design values that R-STYLE-001's enforcement cannot see. | `#0e152e` ×3 plus `hsl()`/`hsla()` stops at `poke-holo.css:194-205`. `extract-theme-values.mjs` reads `theme.css` only. | R-STYLE-001 says `theme.css` is the only place a design value is written, and R-STYLE-007 protects the holo shine as identity. Both are true and they collide here, with nothing to say which wins. | This is a rule the code structurally ignores. Per the standard, it goes to `## Open` rather than being decided by me: either the gradient artwork is carved out of R-STYLE-001 in writing, or its stops become tokens. | — |
| 13 | Later | `visual/`'s stated job is finished. | `playwright.config.ts:4` — "for one job: making the Tailwind migration of `cards.css` safe" and "before moving another rule out of `cards.css`". `cards.css` no longer exists (`2026-08-21-cards-css-gone`). | Not dead — it photographs ten pages at three widths and would catch a cascade regression. But it is a migration artefact whose migration is over, and nothing says what it is for now. | A question for you, not a deletion: keep it as the general cascade net and rewrite the header, or retire it. | — |
| 14 | Later | Two validation idioms. | `zod` in `dependencies` and used once, in `lib/core/env.ts:1`. Zero zod under `src/app/api`; the 12 body-reading routes use hand-rolled validators such as `validateCardDraft`. | Everything from outside **is** validated — this is a consistency finding, not a hole. But the next person adding a route has two patterns to choose from and no rule naming the winner. | Pick one and write it as a rule. The hand-rolled validators return typed results already; zod would not obviously improve them. | — |

### Not findings — checked and clean

Recorded because a silent gap is worse than a known one.

- **Cross-feature imports: zero.** The naive `rg "from '@/features/"` returns 37 hits; all 37 are a feature importing *itself*. Comparing source feature to target feature gives 0 violations. R-STRUCT-001, 002 and 003 all hold.
- **Hardcoded palette colours in first-party code: zero.** `bg-(blue|red|…)-N` and `text-(gray|slate|…)-N` → 0 matches outside the vendored trees.
- **Hex literals outside `theme.css`:** every hit is either a comment, or `theme-values.generated.ts` (generated from `theme.css` and checked by `--check`), except `poke-holo.css` — finding 12.
- **Server/client boundary:** no non-`NEXT_PUBLIC_` `process.env` read in any of the 82 `'use client'` files; no storage or service-role import in one.
- **`any` / `@ts-ignore` / `@ts-expect-error` in first-party code: zero.** The five `any`s are all in `src/utils/is-react-component.ts`, which is vendored Untitled UI.
- **Clickable `<div>`s: one**, `Modal.tsx:361`, a dialog backdrop — the conventional pattern, with Escape and a real close button alongside.
- **`depcheck`'s four "unused" devDependencies are false positives.** `@tailwindcss/postcss` is in `postcss.config.mjs:10`; `tailwindcss`, `tailwindcss-animate` and `tailwindcss-react-aria-components` are at `globals.css:19-24` via `@import`/`@plugin`. depcheck does not read CSS.
- **`knip`'s unused exports inside `components/base|application`** are the vendored library's own surface. R-UI-003 forbids editing it. Not findings.
- **`scripts/*.mjs` flagged as unused files** are hand-run operational scripts (`node scripts/audit-collection.mjs`). Not dead.
- **`visual/` baselines are gitignored on purpose**, and `playwright.config.ts:20-31` explains why at length: the pages render live Cardmarket prices, so a committed baseline would be red by morning. Correct call, clearly written. I suspected a hollow test suite and was wrong.

---

## 3. Title and token inventory

The tokenset a title may draw on, from `theme.css`: the `--text-*` steps with their
paired `--line-height` and `--letter-spacing`, the `--font-title` weights, and the
semantic text colours. Sizes are the meterstick; everything below is measured against them.

**Every font size in first-party code comes from the tokenset.** There is no
exception to report.

- `rg "text-\[[0-9]|font-size:"` over `src`, excluding the vendored trees, returns
  **zero** hits outside `type-discipline.test.ts` (the check itself) and a comment
  in `theme.css`.
- `rg "<h[1-6][^>]*font-(medium|semibold|bold|black)"` → **zero**. R-STYLE-003 holds.
- 90 raw `<hN>` tags, all drawing sizes from the scale.

Usage against the two registers in `CONVENTIONS.md`:

| Token | Register | Consumers |
|---|---|---|
| `text-display-md` | Public page title | 4 |
| `text-display-sm` | Public section | 2 |
| `text-display-xs` | App page title | 14 |
| `text-xl` | App section | 5 |
| `text-lg` | Public card | 7 |
| `text-md` | App card | 6 |
| `text-hero` / `text-hero-narrow` | Out of table, named | 4 / 2 |
| `text-wordmark` | Out of table, named | 1 |
| `text-micro` | Out of table, named | 1 |
| `text-display-lg` | **In no register** | **0** |
| `text-display-xl` | **In no register** | **0** |
| `text-display-2xl` | **In no register** | **0** |

Every out-of-table token that `CONVENTIONS.md` justifies by naming its caller does
have one. The three at the bottom are finding 5: defined, in no register, unused.

**Step 4, consistency.** No two places render the same kind of title at different
values. `text-display-xs` carries every app page title (14 callers) and
`text-display-md` every public one (4).

**Step 5, how this is held.** It already is, and better than a component would
hold it: `type-discipline.test.ts` is a static scan over `src/app`, `src/features`,
`src/components/shared` and `src/providers` that fails on any raw size in a
className, and its failure message carries the fix. One gap worth a line — `src/lib`,
`src/hooks` and `src/utils` are not in `ROOTS`. Today none of them contains a
className string, so nothing escapes. Adding `src/lib` costs nothing and closes it
before something does. **Recommendation: add `src/lib` to `ROOTS`.**

---

## 4. Cleanup list

### Reason I could not reconstruct — for you

Nothing. Every construction I flagged carries its own rationale in a comment, which
is unusual and is the main reason this audit found no blocking issues. The three
items below are questions of intent, not of lost reasoning:

- **`visual/`** — purpose fulfilled, still functional. Keep as a general cascade net
  or retire? (Finding 13.)
- **`poke-holo.css` gradient stops** — identity artwork or design values? (Finding 12.)
- **`cardPricesTag`** — is the hourly timer the intended mechanism? (Finding 8.)

### Remove

| Path | What | Outcome | Why |
|---|---|---|---|
| `eslint.config.mjs:97`, `.prettierignore`, `tsconfig.json:52`, `tsconfig.vendored.json` | `use-breakpoint.ts` entries | Remove | File deleted in `c38dacf`. Four dead entries and a trap for a future first-party file of the same name. |
| `.prettierignore` | `app/styles/tailwind.generated.css` | Remove | Path does not exist. |
| `lib/core/motion.ts` | `SPRING_PILL`, `SPRING_BUBBLE`, `EASE_SMOOTH` + their comments | Remove | Zero consumers; the comments describe chat bubbles and connect lists that this product does not have. |
| `lib/core/motion.ts:1` | Header reference to `app/styles/tokens.css` | Correct | Path does not exist. |
| `value-snapshot.ts:36` | "Nothing invalidates this today" | Correct | It is invalidated, at `cron/snapshot/route.ts:122`. |

### Keep, verified in place

- The six `for now` / `temporary` hits are all deliberate and all carry their reason
  in the same comment (`artwork.ts:44`, `tabbarClasses.ts:246`, `CardsDashboard.tsx:68`,
  `cards/[id]/page.tsx:34`, and two in user-facing copy). None is an ownerless TODO.
- No `TODO`, `FIXME`, `HACK`, `XXX` or `@deprecated` anywhere in first-party code.
- No commented-out code.
- The four `docs/*.md` worklists and the `*.undo.json` rollback files are live
  database state, as `CLAUDE.md` says. Not history, not cleanup.
- `MIGRATION.md` is already gone.

### Out of scope, named only

`.dev-standards/`, `CLAUDE.md`, `AGENTS.md` and `CONVENTIONS.md` are the decision
layer and follow the Dev Standard, not this audit.

---

## 5. What I could not verify

- **A clean install.** I did not `rm -rf node_modules`; the working tree was in use
  for this audit throughout. `./scripts/verify.sh` passes end to end on the existing
  tree — secrets, node, format, tokens, typecheck, test, lint, build, standards,
  record numbers — exit 0. CI (`check.yml`) does `npm ci` from scratch on every push,
  so the clean path is covered continuously; it is just not covered *by me*.
- **Whether the test count fell during the migration.** 43 test files today. I did
  not reconstruct the count before the migration, because the migration predates the
  branch point and `git log` over deleted test files would need a date I would be
  guessing at.
- **Runtime accessibility.** I checked structurally — React Aria intact, one backdrop
  `div`, `main-landmark.test.ts` enforcing one `<main>` per screen. I did not drive a
  screen reader or a keyboard through a real page.
- **Whether the four Untitled UI plugins are all still needed at runtime.** They are
  imported; I did not check that removing one would visibly change anything.

---

## 6. The three future-proof questions

**Can a new developer add a feature within a week? — Yes.** The structure is
enforced rather than described: three eslint rules on feature boundaries, a token
test, a contrast test, a landmark test, a body-limit test. A newcomer finds out
they broke the shape from a failing check, not from review.

**Can a feature be removed without archaeology in five directories? — Yes, for the
two that exist.** `features/collection` and `features/account` are self-contained,
and I verified zero imports between them. The caveat is finding 10: the boundary is
held by a hand-written pair list, so this answer is about the codebase as it is, not
as it scales.

**Can Untitled UI be updated without merge hell? — Yes.** The vendored trees are
untouched by hand, exempted per tree in four configs, checked by a separate tsconfig
that keeps `strict` while dropping the four flags the library is not written under,
and added through `npm run ui:add` which repairs what the generator breaks. This is
the best-defended part of the repo. One gap: `components.json` does not exist, so
`npx untitledui upgrade` has no baseline version to diff from — already in
`CONVENTIONS.md`'s `## Open`.

---

## 7. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Clean install + typecheck + lint + test + build all green, no ignored warnings | ⚠️ partly | `./scripts/verify.sh` → exit 0, all ten checks. Not run from a wiped `node_modules` — see section 5. `lint` is `--max-warnings 0`, so there are no ignored warnings. |
| No hardcoded design value in `src/`; `theme.css` demonstrably the only source | ⚠️ partly | Zero in first-party TS/TSX. `poke-holo.css` is the exception, and nothing checks it — finding 12. |
| Every title from the tokenset, same kind of title identical everywhere | ✅ | Section 3. Zero raw sizes; no inconsistent pair found. |
| No cross-feature imports; no dead code or unused dependencies | ✅ | 0 cross-feature imports, verified per source feature. `knip` and `depcheck` hits triaged in section 2 — all vendored surface, hand-run scripts, or CSS-loaded plugins. |
| No `any`, `@ts-ignore`, `as any` without a stated reason | ✅ | Zero in first-party code. Five in `is-react-component.ts`, which is vendored. |
| Server/client boundary correct | ✅ | No secret or server-only import in any of the 82 client files. |
| One document describes the current state; no second document contradicting it | ✅ | `CONVENTIONS.md`, and `CLAUDE.md` says so explicitly. |
| `MIGRATION.md` gone, everything in it handled | ✅ | Absent. |
| No two documents contradicting each other about the codebase | ❌ | `docs/CHANGELOG.md` says it is generated from `changelog.d/`; it is not — finding 3. |
| No commented-out code, no ownerless TODOs, no migration shims in `src/` | ✅ | Zero of each. The six "temporary" markers all carry a reason. |
| One active mechanism enforcing token discipline | ✅ | `type-discipline.test.ts`, plus `contrast.test.ts` and `extract-theme-values.mjs --check`. Three, not one. |

Nine of eleven met, two partly, one failed.

---

## 8. Ground to build on

**Adding a feature.** Create `src/features/<domain>/` with `components/` and
`hooks/`. Data access goes in `src/lib/`, never in the feature — there is no
`actions.ts` or `queries.ts` here. Route-only UI goes in that route's
`_components/`. The route composes the feature; the feature never imports a route
or another feature. Design values come from `theme.css` and nowhere else.

**The three places this will shift if nobody watches.**

1. **The feature-boundary lint, at feature three.** It names `collection` and
   `account` explicitly. The third feature is unguarded on the day it is created,
   and the failure is silent.
2. **`lib/core/`, also at feature three.** Already named in `CONVENTIONS.md`'s
   `## Open`. It is currently a single bag holding catalogue matching, pricing,
   artwork, motion constants and formatting.
3. **`CONVENTIONS.md`'s own size.** 45 rules against a standard that caps the set
   at 15, and 9 of them marked `Intent` — which by the project's own definition
   means nothing checks them. See below.

**Deliberately left, will wring later.** No component renders in any test. All 43
test files are API routes, `lib/`, or static file scans. That is a defensible shape
for a codebase whose UI logic mostly lives in vendored React Aria components — until
`Modal.tsx` grows to 404 lines of hand-rolled focus management, which it has.
Finding 1 is the first bill for it.

---

## 9. `CONVENTIONS.md` — proposed reduction

You left this to me. The rule set is 45 rules where both the installed standard
(ceiling 15) and the Dev Standard doc ("houd de set klein") say it should be
smaller, and `verify.sh` currently *skips* the check that would say so.

The 9 `Intent` rules are the place to start, because the file's own preamble
concedes them: "Anything on this list is a candidate to make enforceable or to
drop." My recommendation per rule:

| Rule | Now | Proposal |
|---|---|---|
| R-STYLE-005 | Intent | **Drop.** A token in `:root` generating nothing is Tailwind behaviour, not a project rule. It belongs in a comment in `theme.css`. |
| R-STYLE-009 | Intent | **Drop.** Same: a naming caution, not a testable rule. |
| R-STYLE-010 | Intent | **Drop.** Advice about a CSS technique. Unenforceable as written. |
| R-STYLE-011 | Intent | **Drop.** "Grep before deleting" is a working habit, not a convention. |
| R-STYLE-012 | Intent | **Enforce.** A literal class name defined nowhere is findable by a static scan, exactly like `type-discipline.test.ts`. |
| R-STYLE-018 | Intent | **Fold into R-STYLE-007.** It is a fact about one file; state it in the file. |
| R-UI-007 | Intent | **Enforce.** "A vendored component with no consumer" is what `knip` already reports. |
| R-PLAT-001 | Intent | **Keep as Intent, or move to the README.** Nothing in this repo can check Cloudflare's setting. It is real and it is not a code rule. |
| R-PLAT-002 | Intent | **Same.** A Vercel dashboard setting. |

That is 5 dropped, 2 made enforceable, 2 acknowledged as environment facts rather
than code rules — taking the set from 45 to 40 and the `Intent` count to 0 or 2.

Getting from 40 to 15 is a larger conversation and I am not going to pretend
otherwise: the Styling block alone is 18 rules, and most of them are load-bearing.
My honest read is that **15 is the wrong ceiling for this repo** and the rule to
change is the standard's, not this project's. The set is long because the project
is unusually disciplined, not because it is an archive. What it does need is the
`Intent` tier gone, since a rule nothing checks is the thing the ceiling exists to
prevent.

`verify.sh` currently skips the `conventions` check with those numbers written into
the skip line. Once the `Intent` tier is resolved, two of the three blockers to
turning it on are gone; the third is the rule-count ceiling.
