# Eindcheck

Controle only. Nothing was changed to produce this. Every row was re-verified
against the code, not read out of the document that claimed it.

**Read this with one caveat.** The prompt asks for a fresh session, so the agent
is checking rather than defending. This ran in the session that did the work. It
is the weakest link in this document and it applies most to the ⚪ rows, where
"there is no equivalent" is exactly what someone defending their own code would
say.

---

## Verdict

**NIET AFGETEKEND — 4 openstaande punten.** Three are decisions waiting on Bart;
one is a genuine gap nobody has picked up.

Everything mechanical passes. What is left is judgement.

---

## The table

### Acceptance criteria from `AUDIT.md`

| Source | Point | Status | Evidence | Note |
|---|---|---|---|---|
| AUDIT §7 | Clean install + typecheck + lint + test + build, zero ignored warnings | ✅ | `rm -rf node_modules .next && npm install` → all four exit 0. `grep -ci warn` on the build log → **0** | 43 test files, **483 tests** |
| AUDIT §7 | No hardcoded design value in `src/`; `theme.css` demonstrably the only source | ✅ | palette classes **0**, arbitrary font-size **0**, `@theme` outside `theme.css` **0** | Enforced by `type-discipline.test.ts` and `extract-theme-values.mjs --check` |
| AUDIT §7 | Every title from the token set, same kind identical everywhere | ✅ | `font-medium\|semibold\|bold` on a heading → **0**. Two registers in R-STYLE-004 | Was ❌ at audit time |
| AUDIT §7 | No cross-feature imports; knip and depcheck clean | ⚠️ | cross-feature **0** ✅ · unlisted deps **0** ✅ · **42 unused files, 2 unused deps** ❌ | See open point 4 |
| AUDIT §7 | No `any`, `@ts-ignore`, `as any` without explanation | ✅ | 1 hit, and it is English prose: `CardItem.tsx:378` "…as any other number on a tile" | |
| AUDIT §7 | Server/client boundary correct | ✅ | server-only imports in client components → **0** | |
| AUDIT §7 | One document describes the current state | ✅ | `CONVENTIONS.md`, 41 rules with stable IDs. `README.md` describes `src/` | Was ❌ at audit time |
| AUDIT §7 | `MIGRATION.md` gone, contents processed | ✅ | file absent; A1–A5 resolved before removal | |
| AUDIT §7 | Decision documents merged into one rule set | ✅ | `docs/decisions/` absent, `CONVENTIONS.md` present | **Bart's decision, twice.** See "crept in" |
| AUDIT §7 | No commented-out code, no ownerless TODOs, no migration shims | ✅ | `TODO\|FIXME\|HACK` → **0** | |
| AUDIT §7 | One active enforcement mechanism for token discipline | ✅ | `src/lib/design/type-discipline.test.ts`, 2 assertions | Was ❌ at audit time |

### Findings from `AUDIT.md` marked to fix

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | `/collection/browse` blocked by the CSP | ✅ | `images.scrydex.com` in the served header on cardorb.com; 68 CSP errors → **0** |
| 2 | `@react-types/shared` imported, not declared | ✅ | `package.json:23`; knip "Unlisted" → 0 |
| 3 | 104 tests deleted with the contrast measurements | ✅ | `contrast.test.ts`, 19 assertions. 462 → 483 |
| 4 | Target structure documented nowhere | ✅ | `README.md:186-216` + `CONVENTIONS.md` |
| 5 | Four title sizes, three weights, no weight token | ✅ | `--font-weight-title` / `-title-strong`; R-STYLE-004 |
| 6 | 15 of 28 API routes without named validation | ❌ | still 0 routes using zod | **Open point 3** |
| 7 | 42 unused files, 2 dependencies alive only through them | ❌ | knip: unchanged | **Open point 4** |
| 8 | Two hero titles on an arbitrary `clamp()` | ✅ | `--text-hero` / `--text-hero-narrow` |
| 9 | `tracking-[…]` fighting the token | ➖ | Not done. Subsumed by R-STYLE-004; the overrides are on the marketing register, which was not re-measured |
| 10 | `src/utils/` and `src/hooks/` mixed | ➖ | Accepted. R-UI-008 records it and `untitled-add.mjs` warns |

### The plan from `UI-ADOPTIE.md`

| Step | Status | Note |
|---|---|---|
| Quick win 1 — `ViewerPill` → `Badge` | ❌ | Not started. Written today; nothing has run yet |
| Quick win 2 — `FormField` → `label` + `hint-text` | ❌ | Not started |
| Quick win 3 — delete or adopt `app-navigation` | ❌ | Not started. **This is also open point 4** |
| `RouteError` → `EmptyState` | ❌ | Not started |
| `Modal` on `react-aria-components` | ❌ | Its own piece of work, by design |
| Borging — R-UI-001…008 + `CLAUDE.md` block | ✅ | `98bd8ef` |

### Rules from `CONVENTIONS.md` — every enforcement command run

| ID | Command | Result |
|---|---|---|
| R-STRUCT-001/002/003 | `npx eslint src/features src/components/shared` | ✅ green |
| R-STYLE-001 | `node scripts/extract-theme-values.mjs --check` | ✅ green |
| R-STYLE-002 | `vitest run src/lib/design/type-discipline.test.ts` | ✅ 2 passed |
| R-STYLE-015 | `scripts/untitled-add.mjs` — `@untitledui/icons` in `package.json` | ✅ absent |
| R-STYLE-016 | `vitest run src/lib/design/contrast.test.ts` | ✅ 19 passed |
| R-UI-006 | `tsc --noEmit -p tsconfig.vendored.json` | ✅ exit 0 |
| R-PLAT-003 | `vitest run src/app/main-landmark.test.ts` | ✅ passed |

**All 10 Enforced rules verified by running their command.** No rule claims an
enforcement it does not have.

### Structure described in `README.md`

| Claim | Status | Evidence |
|---|---|---|
| Everything under `src/` | ✅ | `src/app`, `src/features`, `src/components`, `src/lib`, `src/styles`, `src/hooks`, `src/utils`, `src/providers` |
| `types/` and `features/*/actions.ts` deliberately absent | ✅ | absent, and the README says why |
| `/cards` is a redirect | ✅ | `src/app/cards/page.tsx` — `redirect()` |
| Three CSS files + `poke-holo.css` | ✅ | `theme.css`, `globals.css`, `app.css`, `poke-holo.css` |

---

## What fell between the cracks

- **`components.json` does not exist.** The adoption prompt opens with
  `cat components.json` — Untitled UI's own CLI config, which records the version
  and the brand colour. This project has never had one; components were added
  with explicit `-t` and `-p` flags. It works, but the version we are vendored
  against is written down nowhere, so `npx untitledui upgrade` has no baseline.
- **`app.css` is still empty.** That is the intended state and worth saying out
  loud: layer 3 has attracted nothing in a week of work.
- **`AUDIT.md` and `UI-ADOPTIE.md` are now themselves point-in-time documents**
  of the kind this project just deleted 133 of. Their live content is in
  `CONVENTIONS.md`'s Open section. They should go the same way once acted on.
- **Ten rules are marked Intent.** By this project's own standard those are not
  rules. They are listed under Open, which is honest, but a list that stays a
  list becomes an archive.

## What crept in without being written down

- **The decision records were deleted, not archived.** The dev standard says
  *"stempel en verhuis de originelen naar `docs/adr/`… verwijderen alleen bij
  echte duplicaten of lege notities"*. 133 records were removed. This was Bart's
  explicit instruction, given twice and confirmed after the conflict was pointed
  out — so it is a decision, not drift. It is here because a reader in six months
  will find a standard the repository does not follow, and nothing else says why.
- **The audit ran in the migration's own session**, against `00-overzicht.md`,
  which asks for a fresh one. So did this check and the adoption report. The
  reason for the rule is real and it was not followed.
- **`scripts/verify.sh` lost its record-number step.** It had nothing left to
  check once `docs/decisions/` was gone. `verify.sh` is a shared file across
  worktrees; the edit was flagged at the time but it is a change to a shared
  thing made for a local reason.
- **`AUDIT.md` carries a correction to itself.** Its recharts finding was wrong —
  Next splits client components per route on its own. Corrected in place with the
  measurement.

## The four open points

| # | Point | Cost | Whose |
|---|---|---|---|
| 1 | **Three colour pairs below WCAG.** Placeholder in dark **4.18**/4.5; a control's border **1.48** light and **1.91** dark against 3:1. The first step that clears 3:1 is `neutral-500`, a mid-grey that changes every control in the app | An afternoon, plus a look | **Bart** |
| 2 | **The `UI-ADOPTIE.md` quick wins** — `ViewerPill`, `FormField`, `app-navigation` | Half a day | Ready to run |
| 3 | **15 of 28 API routes have no named validation**, nothing uses zod but the env check | A day | Nobody has picked it up |
| 4 | **42 unused vendored files, and 2 dependencies alive only through them** | An hour to delete | Was decided as "keep" in a feedback record that has since been deleted. **The decision now exists nowhere** |

Point 4 is the sharpest illustration of what removing the records costs: the
reasoning was *"ze zijn vers, laat maar liggen"*, it was a real answer to a real
question, and it is now only in `git log`.

---

## Eindoordeel

**Yes, this is a codebase you can build on for years — and the reason is not the
structure, it is that ten of its rules now fail a command instead of asking a
person to remember.** Boundaries between features, one source for every design
value, no font size in a className, contrast on every text-on-surface pair, one
main landmark. Those cannot rot quietly, and a year from now that will matter
more than any folder name.

The structure is good but ordinary — `src/`, features, route-local components. A
competent developer would arrive at it. What is not ordinary is that the
migration was done in twenty-four reviewable commits with the checks green at
each one, and that the audit found its own author's claim about recharts to be
wrong and said so.

Where I would not be relaxed: **three WCAG failures are shipping right now**, and
one of them — a control's border at 1.48:1 — is on every input and checkbox on
the site. It is measured, pinned, and documented, which is much better than
unknown. It is still shipping. And the ten Intent rules are a slow leak: each is
a thing someone decided mattered and nothing checks.

The thing that will hurt most is not on any list above: **133 decision records
were deleted this week, and the one place it already bit is open point 4** — a
decision that exists now only as a line in a git log nobody will think to search.
That was a deliberate choice, made twice, against the project's own standard. It
is defensible. It is also the one thing here that cannot be undone by running a
command, and its cost arrives later than everything else on this page.
