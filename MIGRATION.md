# Migration — folder structure to `src/` + `features/`

Phase 0 report. Read-only: nothing in this repository was changed to produce it.

**Target**, from the brief:

```
src/
├── app/                    routing + data fetching only; route-local UI in _components/
├── components/
│   ├── base/               Untitled UI primitives (CLI-managed)
│   ├── application/        Untitled UI patterns
│   ├── foundations/        icons, logos
│   └── shared/             our own reusable components
├── features/<domain>/      components/ hooks/ actions.ts queries.ts schemas.ts
├── lib/                    db, auth, clients, env.ts
├── hooks/  utils/  providers/  types/
└── styles/theme.css        design tokens = single source of truth
```

---

## 1. Inventory

**Router: App Router only.** No `pages/`, no mix.

| Directory | Lines | Files | Note |
|---|---:|---:|---|
| `app/` | 9,496 | 88 | 24 `page.tsx`, 29 `route.ts`, 2 `layout.tsx`, 4 loading/error/not-found |
| `components/custom/` | 11,821 | 65 | **our own components — the `shared/` + `features/` split happens here** |
| `components/base/` | 2,791 | 22 | Untitled UI, CLI-managed |
| `components/application/` | 2,899 | 22 | Untitled UI, CLI-managed |
| `components/foundations/` | 410 | 4 | Untitled UI |
| `components/shared-assets/` | 4,492 | 10 | Untitled UI illustrations/patterns |
| `lib/` | 10,705 | 66 | `core/` 8,257 · `storage/` 1,230 · `api/` 991 · `design/` 30 |
| `styles/` | 890 | 3 | done last week; `theme.css` is already the single source |
| `scripts/` | 2,459 | 10 | |
| `hooks/` `utils/` | 115 | 3 | Untitled UI's, effectively |
| `visual/` | 329 | 4 | Playwright |

Two directories inside `app/` are not routes and should not be there:
`app/hooks/` (`useSlidingPill.ts`) and `app/styles/` (`poke-holo.css`).

**Duplicates and dead code**

| | Count | Note |
|---|---:|---|
| Unreachable vendored Untitled UI files | **31 files, 6,651 lines** | FB-0023 records the decision to keep them (*"ze zijn vers, laat maar liggen"*). Out of scope; Phase 5 may revisit. |
| Dead components in `components/custom/` | **0** | every one has a consumer |
| Components with exactly **one** consumer | **31 of 65** | these are the `_components/` and `features/` candidates |

## 2. Styling sources — hardcoded colour and spacing

| Kind | Count | Where |
|---|---:|---|
| Hex in our own `.tsx` / `.ts` | **0** | outside comments; verified |
| Hex in vendored | 369 | 364 in one SVG (`background-patterns/grid-check.tsx`), 5 in the UUI logo |
| **Arbitrary `px`/`rem` in classNames** | **88** | `max-w-[…]` 27 · `mt-` 8 · `h-` 8 · `gap-` 7 · `w-` 6 · `rounded-` 5 · `tracking-` 3 |
| `bg-blue-600`-style literal palette classes | **0** | the app writes semantic tokens (`bg-primary`, `text-secondary`) |

The 88 arbitrary values are the only real double truth left, and most are
one-off page widths rather than tokens. **This is screen work, not structure**,
and it does not belong in this migration.

## 3. State of the v4 theme layer

Rebuilt last week (ADR-0093, ADR-0094) — this half of the brief's Phase 1 is
already done, by a different route than the brief describes.

| Brief's Phase 1 requirement | State |
|---|---|
| One `styles/theme.css`, the only place tokens live | **done** |
| `globals.css` imports only | **done** — imports, `@plugin`, `@custom-variant`, base. 199 lines against a 200 ceiling |
| Remove a `@config` bridge to an old JS config | **never existed** |
| Untitled UI token naming | **done** — taken name-for-name, nothing renamed |
| `@plugin "tailwindcss-animate"` + `"tailwindcss-react-aria-components"` | **done**, v4-native `@plugin` in `globals.css:23-24` |
| `utils/cx.ts` | **exists**, 49 importers |
| `lib/env.ts` with zod | **missing.** `lib/core/env.ts` exists and reports missing vars at boot from `instrumentation.ts`, but it does not validate and **zod is not installed** |
| `providers/` directory | **missing** |
| Path alias `@/*` → `src/*` | **`@/*` → `./*`.** Repointing it is the whole trick that makes Phase 2 cheap |

**No `tailwind.config.*` exists**, historical or otherwise. Tokens are all in
`@theme`. Dark mode is `light-dark()`, so there is no `.dark-mode` class and no
second selector.

## 4. Dependencies that clash

**None.** `react-aria` / `react-aria-components` is the only UI system —
no Radix, MUI, Headless, Chakra, Mantine, Ant, styled-components or Emotion.
No `clsx` and no `cva` either; `utils/cx.ts` wraps `tailwind-merge`.

`@tailwindcss/typography` is not installed and is not needed — the only `prose`
in the tree is a word in a comment.

## 5. Blast radius

Most-imported own modules. The higher the count, the more import lines a move
rewrites — and the more a bad codemod costs.

| Module | Importers |
|---|---:|
| `utils/cx` | **49** (46 of them vendored) |
| `lib/api/viewer` | 31 |
| `lib/core/config` | 30 |
| `lib/core/cards` | 23 |
| `components/base/buttons/button` | 23 |
| `lib/api/guard` | 22 |
| `lib/core/collection` | 20 |
| `lib/storage/supabase` | 18 |
| `components/custom/Button` | 15 |

**Import style is the number that decides the plan:**

- **389** imports use the `@/` alias — these cost **nothing** to move, because
  repointing `@/*` to `./src/*` keeps every one of them valid.
- **182** imports dig with `../../` — these break on any move and are what a
  codemod has to rewrite.

## 6. Proposed phasing

Every phase is one PR, green on its own, and reversible.

| # | Scope | Files changed | Risk | Rollback |
|---|---|---:|:---:|---|
| **1a** | `lib/env.ts` with zod, `providers/` — the two leftovers from the brief's Phase 1. New files only, nothing moves | ~4 new | **L** | delete the files |
| **1b** | Create `src/`, `git mv` the four leaf directories nothing imports deeply: `styles/`, `utils/`, `hooks/`, `visual/`. Repoint `@/*` → `./src/*` | ~10 moved, ~5 config | **L** | `git revert` |
| **2a** | `git mv components/ → src/components/`, rename `custom/` → `shared/`. Codemod the 182 relative imports | ~180 | **M** | `git revert`; renames are legible in `--stat` |
| **2b** | `git mv lib/ → src/lib/` | ~90 | **M** | `git revert` |
| **2c** | `git mv app/ → src/app/`, plus lifting `app/hooks/` and `app/styles/` out of the route tree | ~100 | **M–H** | `git revert`. Highest risk of the moves: Next resolves routes from the filesystem, so a mistake is a 404, not a compile error |
| **3** | Route-local components → `app/<route>/_components/`. **31 candidates** already identified, each with exactly one consumer | ~60 | **L** | per-component revert |
| **4** | Extract `features/`. Proposed domains below | ~150 | **H** | phase per domain, not all at once |
| **5** | Boundaries lint (`import/no-restricted-paths`), `knip`/`depcheck`, close this file | ~5 | **L** | remove the rule |

**Proposed feature domains**, read off the routes and `lib/core`'s 52 modules:

| Domain | Would absorb |
|---|---|
| `collection` | `cards`, `collection`, `collection-row`, `ownership`, `cards-stats`, `pokedex`, `CardsView`, `CardItem`, `CardsSidebar`, `FilterMenu`… |
| `catalogue` | `catalogue`, `matching`, `tcgdex-client`, `ptcg*`, `browse-artwork`, `set-aliases`, `eras`, `BrowseSet*`, `SetIndex` |
| `pricing` | `cardmarket`, `value-chart`, `value-snapshot`, `movers`, `snapshot`, `CollectionValueCard` |
| `account` | `account`, `owner`, `slug`, `csv`, `ProfileSettings`, `AccountSettings`, `ImportSettings`, `Onboarding` |
| `auth` | `lib/api/viewer`, `guard`, `recovery`, `session-cookie`, `SignInForm`, `PasswordForm`, `ForgottenForm` |

**Ordering rationale.** Leaves first, `app/` last. `app/` is the only directory
where a wrong move produces a route that silently stops existing rather than a
build error — everything else is caught by `tsc`.

**Codemod.** `ts-morph` over `tsconfig.json`, rewriting only relative specifiers
whose resolved target moved. The script gets shown and reviewed before it runs,
per the brief. `@/`-prefixed imports are not touched at all.

**Verification after every step:** `./scripts/verify.sh` — one command covering
prettier, the token generator's `--check`, typecheck, 452 tests, lint and build.

## 6b. Assumptions taken while Phase 1–2 ran

Recorded rather than asked, because a question must not stop the work. Each is
reversible; raise any of them and it changes.

**A1 — `visual/` stays at the repository root.** The brief's target tree does not
name it, Playwright's `testDir` points at `./visual`, and it is test
infrastructure rather than source. Moving it buys nothing and adds a config to
get wrong.

**A2 — `@/*` resolved `["./src/*", "./*"]` for the duration. ~~Deadline~~ done.**
Without the pair the alias could only be flipped after every one of its six tops
had moved, which is the big bang the brief forbids. The second entry came out
the moment `src/` held everything `@/` reaches — leaving it would mean a stale
root copy of a moved file keeps resolving silently. `@/*` is `["./src/*"]`
again, and vitest's alias is a plain string rather than a customResolver.

**A3 — relative imports crossing a directory boundary become `@/` imports.**
The depth differs per file and would have to be recomputed at every later move.
224 specifiers were converted this way in Phase 2b alone. It is an import
rewrite inside a move, which the brief endorses; it is not a content change.

**A4 — `docs/` is never swept.** 209 mentions of `components/custom/` live in
decision records, which are immutable and historically accurate: that *is* where
the file was when the record was written. `STATE.md` carries this project's own
account of a blanket `sed` silently rewriting a dozen unrelated records.

**A5 — the two `hooks/` directories are merged.** `app/hooks/` (three hooks this
project wrote) and `hooks/` (Untitled UI's `use-breakpoint.ts`) are one
`src/hooks/` now. Consequence, and it is the kind that hides: the vendored
eslint/prettier/tsconfig exemption was a **directory** glob, so merging would
have silently exempted our three hooks from linting. It names
`use-breakpoint.ts` by file now. **If `npm run ui:add` writes another vendored
hook, it has to be added to that list** — `scripts/untitled-add.mjs` prints what
it changed, which is where it will show.

**A6 — `lib/design/` keeps its name inside `src/lib/`.** The brief's tree does
not mention it and it holds one generated file. Folding it into `src/lib/` flat
is cosmetic and belongs in Phase 5, not in a move.

### The pattern all of Phase 2 confirmed

`tsc` catches every broken import. **The risk lives entirely in code and
configuration that treats a path as data**, and none of it is type-checked:

| Where | Found in |
|---|---|
| `tsconfig.json`, `tsconfig.vendored.json` include/exclude globs | 1b, 2a-i, 2c |
| `eslint.config.mjs` vendored ignores **and** `CACHE_OWNERS` | 1b, 2a-i, 2b |
| `.prettierignore` | 1b, 2a-i |
| `scripts/extract-theme-values.mjs` input **and** output paths | 1b, 2b |
| `scripts/*.mjs` importing `../lib/...` — Node reads no tsconfig paths | 2b |
| **`vi.mock()` / `await import()`** — a specifier as an *argument*, invisible to an import-statement regex | 2b, 32 of them |
| **Tests that read source files by path** — `main-landmark.test.ts`, `routes.test.ts` | 2a-i, 2c |

The last two are the ones that bite: a `vi.mock()` with a dead path fails at
collection time in a message naming the test, and a route-walking test is only
as good as the string it walks from.

## 7. Open questions

**Q1 — `components/custom/` → `components/shared/`, or straight into `features/`?**
31 of its 65 files have exactly one consumer, so "shared" would be a lie for
half of them.
*Recommendation:* rename to `shared/` in Phase 2a anyway, then let Phases 3 and 4
empty it. Moving and re-homing in one step breaks the brief's own rule that a
file never moves and changes meaning in the same commit.

**Q2 — Does `app/` really need to move?**
It is the highest-risk move and buys the least: `src/app` and `app` behave
identically in Next.
*Recommendation:* do it, but last and alone. Half a `src/` is worse than none —
and if it is skipped, say so here rather than leaving it looking unfinished.

**Q3 — `lib/env.ts` with zod, when `lib/core/env.ts` already reports at boot?**
The existing one names missing variables in the log and deliberately does not
throw, because every degradation is intentional.
*Recommendation:* keep that behaviour and add zod only for *shape* validation
(a malformed URL, a key of the wrong length). Do not make it throw. Note that
this adds a dependency.

**Q4 — the 31 unreachable vendored files (6,651 lines)?**
FB-0023 already answered: keep them.
*Recommendation:* leave them. Phase 5's `knip` run will list them; the
expected outcome is that they stay and this file records why.

**Q5 — how much can land while `origin/main` moves?**
ADR-0048's warning is on record: `origin/main` moved during a session and two
workspaces built the same thing twenty minutes apart. A tree-wide rename
conflicts with everything.
*Recommendation:* Phase 2 lands in one sitting or not at all, and nothing else
should be in flight while it does. This is the question only you can answer.

---

## Found on the way, deliberately not fixed

- **`/collection/browse` is missing set logos in production.** pokemontcg.io
  serves them from `images.scrydex.com` now; the CSP at `next.config.ts:36`
  allows only `assets.tcgdex.net` and `images.pokemontcg.io`. 68 console errors
  on that page, four blank set tiles in the first screen. The allowlist dates
  from `02111fd` (2026-08-09). Adding a third-party image host to a CSP is a
  security decision, not a migration one.
- A React duplicate-key warning on the same page.
- **The measured contrast arguments are gone** with `lib/design/tokens.ts`
  (`git show 22ca2cb~1:lib/design/tokens.ts`). A colour change today ships
  unmeasured. Unrelated to this migration, but it is the largest open debt in
  the repository.

---

**Phase 0 ends here. Nothing moves until you say so.**
