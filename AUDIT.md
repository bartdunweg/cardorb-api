# Release audit — `src/` + `features/` migration

Diagnosis only. Nothing was fixed. Every ✅ below carries a command output or a
`file:line`; anything I could not check is in section 5 rather than left silent.

---

## 1. Verdict

**READY, subject to 3 fixes** — one production defect that predates this
migration, one dependency that will break a future update, and one deleted
safety net.

The structural work itself holds up under every check I could run. The findings
are not in the migration; they are in what the migration made visible.

---

## 2. Findings, by severity

| # | Severity | Finding | Evidence | Consequence | Fix | Estimate |
|---|---|---|---|---|---|---|
| 1 | **Blocking** | `/collection/browse` cannot load set logos in production. pokemontcg.io is moving its CDN to `images.scrydex.com` per set; the CSP allows only `assets.tcgdex.net` and `images.pokemontcg.io` | `next.config.ts:36` · 68 console errors on that route, 4 blank tiles in the first screen | Broken now, for everyone, and it grows as more sets migrate | Add the host to `IMG_SRC`. **Your call** — a third-party image host in a CSP is a security decision | 1 line |
| 2 | **Blocking** | `@react-types/shared` is imported but not declared | `src/hooks/use-resize-observer.ts:2` · `npx knip` "Unlisted dependencies (1)" · `depcheck` `missing: ['@react-types/shared']` | Resolves today only because it is transitive under `react-aria-components`. The day that package drops or bumps it, the build fails with no warning. Arrived today with the ComboBox | `npm i @react-types/shared` | 1 line |
| 3 | **Before release** | **104 tests were deleted and not replaced.** `main` runs 566, this branch runs 462 | `git checkout origin/main && npm run test` → `Tests 566 passed`; here → `Tests 462 passed`. Files gone: `tokens`, `vars`, `sources`, `token-surfaces`, `shape`, `mechanics`, `cards-css.spec` | Every contrast measurement went with them. A colour change ships **unmeasured** — and `scripts/gen-tokens.mjs` records that this exact failure already happened once (`#767676` under AA in the OG images) | Re-derive the AA assertions against `styles/theme.css` | Half a day, own PR |
| 4 | **Before release** | The target structure is documented **nowhere** | `grep "src/\|features/\|_components" README.md CLAUDE.md` → no matches. It exists only in `MIGRATION.md`, which the brief says to delete | The next developer has no statement of where anything belongs, including the folders that do not exist yet. Deleting `MIGRATION.md` without this first destroys the only copy | One paragraph in `README.md` | 20 min |
| 5 | **Before release** | Page titles use **4 different sizes and 3 different weights**, and `theme.css` defines **no weight token at all** | `display-md/medium` (`LegalPage.tsx:50`, `brand/page.tsx:159`), `display-sm/bold` (`RouteError.tsx:51`), `display-xs/semibold` (`cardsPageClasses.ts:195`), `display-xs/no weight` (`SigninShell.tsx:31`), plus two `clamp()` heroes. `grep -oE "--font-weight-[a-z]+" src/styles/theme.css` → empty | Every heading weight in the app is outside the token set by definition. "The same kind of title looks the same everywhere" is not true today | See section 3 | Half a day |
| 6 | **Before release** | 15 of 28 API routes have no named validation; **zero use zod**, although zod is now a dependency | `find src/app/api -name route.ts \| wc -l` → 28; `grep -rl validate` → 13; `grep -rl zod` → 0 | Untrusted input reaches 15 handlers with only ad-hoc checks. zod was added in Phase 1a for env and stops there | Decide one pattern and apply it | 1 day |
| 7 | **Later** | 42 unused files, and 2 dependencies kept alive only by them | `npx knip` → "Unused files (42)", "Unused dependencies (2): react-aria, react-hotkeys-hook". Both are imported **only** by files knip already flagged dead (`nav-account-card.tsx:13`, `command-menu-users.tsx:5`) | Two packages ship for code nothing renders | FB-0023 already answered: *"ze zijn vers, laat maar liggen."* Re-decide or leave | — |
| 8 | **Later** | Two hero titles use an arbitrary `clamp()` instead of a token | `src/app/page.tsx:254` and `src/app/app/ios/page.tsx:221`: `[font-size:clamp(42px,4.5vw,64px)]` with a 640px override to `clamp(40px,12vw,52px)` | These are the last survivors of the deleted `clamp()` type scale. `STATE.md` lists "the fixed type scale" as an open decision — this is it, still open | See section 3, deviation D1 | 1 hour + a look |
| 9 | **Later** | `tracking-[…]` overrides fight the token that is already applied | `tracking-[-0.045em]` ×4, `-0.03em` ×3, `-0.02em` ×3, `0.06em` ×2. `theme.css:` `--text-display-md--letter-spacing: -0.72px`, which Tailwind applies with the size utility. At 36px, `-0.045em` = **−1.62px** — more than double | The override silently disagrees with the token by a factor of two | See section 3, deviation D2 | 1 hour + a look |
| 10 | **Later** | `src/utils/` and `src/hooks/` are mixed: vendored Untitled UI beside first-party code | `src/utils/cx.ts` + `is-react-component.ts` are vendored; `src/hooks/` holds three first-party hooks and two vendored. Exemptions in `eslint.config.mjs:77-79`, `.prettierignore`, both tsconfigs are **per file** | Every `ui:add` can drop a file there that must be added to four lists by hand. `MIGRATION.md` A5 predicted it and it fired the same day (`use-resize-observer.ts`) | Split vendored into its own directory, or accept and keep the wrapper's warning | Half a day |

### What passed, with evidence

| Check | Result |
|---|---|
| Clean install → typecheck → lint → test → build | **all exit 0**, `rm -rf node_modules .next && npm install` first |
| Ignored warnings | **0.** `eslint --max-warnings 0` passes; `grep -icE "warn" build.log` → 0 |
| Skipped or emptied tests | **0.** `grep -rn "\.skip\|\.todo\|xit(\|xdescribe("` → no matches |
| Cross-feature imports | **0** — and now enforced, `eslint.config.mjs:135-160` |
| Feature → route imports | **0** (`grep -rn 'from "@/app/' src/features src/components`) |
| `components/shared/` → feature imports | **0** |
| Hardcoded palette classes (`bg-blue-600`-style) in own code | **0** |
| Hex outside `theme.css` | Only in `theme-values.generated.ts`, which **is** generated from `theme.css` and checked by `verify.sh`'s tokens step |
| `@theme` outside `theme.css` | **0** (other hits are prose in comments) |
| Server-only imports in client components | **0** |
| `any` / `@ts-ignore` in first-party code | **0.** The 4 hits are in vendored `src/utils/is-react-component.ts` |
| Renames legible in git | **65 renames** in Phase 2a alone, `git diff --summary -M` |

**Folders that do not exist, and correctly so:** `types/` — no content, and this
project keeps types beside what defines them. `features/*/actions.ts`,
`queries.ts`, `schemas.ts` — data access lives in `lib/`. No stray content: no
hook in `utils/`, no schema in `types/`, no provider in `components/`. The
finding is not the empty folder, it is #4 — none of this is written down.

---

## 3. Title inventory (section E)

**The token set that may define a title** (`src/styles/theme.css`):

| Axis | Tokens | Note |
|---|---|---|
| Size + line-height | `--text-xs · sm · md · lg · xl · display-xs · display-sm · display-md · display-lg · display-xl · display-2xl` | 11 steps, each with its own line-height |
| Letter-spacing | `--text-display-md/-lg/-xl/-2xl--letter-spacing` | Applied automatically with the size utility; the four smaller steps have none |
| Colour | `--color-text-primary · secondary · tertiary · brand-* · error/warning/success · placeholder · white` | |
| **Weight** | **none** | **This is finding #5.** Every `font-medium/semibold/bold` in the app comes from Tailwind's default theme, not from `theme.css` |

**88 headings in first-party code.** Grouped by recipe:

| Recipe | Where | From the token set? |
|---|---|---|
| `text-display-md font-medium tracking-[-0.045em] leading-tight` | `LegalPage.tsx:50`, `brand/page.tsx:159` (byte-identical, **duplicated** rather than shared), `marketingClasses.ts:26` (`sectionHeading`, 4 call sites) | size ✅ · weight ❌ · tracking ❌ overrides the token |
| `[font-size:clamp(42px,4.5vw,64px)]` + 640px override, `font-medium tracking-[-0.045em]` | `page.tsx:254`, `app/ios/page.tsx:221` | size ❌ · weight ❌ · tracking ❌ |
| `text-display-sm font-semibold` | `SetIndex.tsx:85`, `BrowseSetIndex.tsx:112`, `SettingsPanel.tsx:40` | size ✅ · weight ❌ |
| `text-display-sm font-bold` | `RouteError.tsx:51` — the only `font-bold` heading | size ✅ · weight ❌ |
| `text-display-xs font-semibold` | `cardsPageClasses.ts:195` (`cardsMainTitleClassName`, the signed-in page title) | size ✅ · weight ❌ |
| `text-display-xs font-medium` | `CardAddDialog.tsx:455`, `CollectionValueCard.tsx:96` | size ✅ · weight ❌ |
| `text-display-xs` alone | `SigninShell.tsx:31` — no weight, no tracking | size ✅ |
| `text-lg font-medium` | `Sheet.tsx:58` | size ✅ · weight ❌ |
| `text-lg font-medium tracking-[-0.03em] leading-snug` | `marketingClasses.ts:36` (`cardHeading`, 4 call sites) | size ✅ · weight ❌ · tracking ❌ |
| no classes (inherit) | 62 headings, nearly all in `privacy`, `terms`, `brand` — they inherit from `LegalPage` | n/a |

### The deviations, and what I would do with each

**D1 — the two `clamp()` hero titles.** `page.tsx:254`, `app/ios/page.tsx:221`.
Two occurrences, so your rule says *snap*, not *promote*. But snapping loses
fluid scaling: the nearest tokens are `display-lg` (48px) and `display-xl`
(60px), against a clamp that runs 42→64px. **This one I am putting to you rather
than deciding**, because your own rule does not cover "the need is real but
occurs twice", and because `STATE.md` already lists "the fixed type scale" as an
open decision. These two headings *are* that decision, still unmade.

**D2 — `tracking-[-0.045em]` (×4) and `tracking-[-0.03em]` (×3).** → **Snap to
the existing token.** `text-display-md` already carries `-0.72px`. The override
sets −1.62px at that size — the visible difference is a noticeably tighter title,
which means removing it *will* change the look. Old `−1.62px` → new `−0.72px`.
The two smaller cases (`-0.02em` ×3, `0.06em` ×2) are on non-title text and are
out of scope for this section.

**D3 — weight.** 30 `font-medium`, 20 `font-semibold`, 6 `font-bold`, and no
weight token exists. → **Add tokens.** Well over three occurrences, and the
need is real. Proposal: `--font-weight-title: 500` and
`--font-weight-title-strong: 600`, in `theme.css`, replacing every
`font-medium`/`font-semibold` on a heading. `font-bold` at `RouteError.tsx:51`
snaps to `title-strong`; it is the only one and nothing argues for a third step.

**D4 — consistency.** `brand/page.tsx:159` duplicates `LegalPage.tsx:50`
character for character instead of using it. Two page titles, one string, two
places — this is the same class of bug as the one `components/shared/` was
supposed to end.

**Which is the norm?** Four sizes claim to be "the page title":
`display-md` (marketing, legal, brand), `display-sm` (route error),
`display-xs` (signed-in pages, sign-in). That is not a deviation from the token
set — every one is a real token — but it means the app has no page-title size.
**This needs your answer before any of the above is worth doing.**

### Enforcement — one recommendation

**A `<Heading>` component with fixed variants** (`page`, `section`, `card`),
in `components/shared/`. Not a lint rule.

The reason is D4: a lint rule forbidding raw `text-*`/`font-*` on `<h1-6>` can
catch a new deviation, but it cannot answer "which of the four is the norm", and
it cannot stop `brand/page.tsx` from duplicating `LegalPage.tsx`'s string. A
component does both, and it is what ADR-0007 already chose for this repository —
shared React components hold the utility string once, `@apply` and
`@layer components` are forbidden.

---

## 4. Cleanup list (section F)

### First: what I could not explain, and want you to decide

| Item | What I could reconstruct | What I could not |
|---|---|---|
| **The whole `docs/` memory system vs. this brief** | `CLAUDE.md:70` — *"Decision records are immutable. Supersede, never rewrite."* ADR-0053 records deliberately keeping memory in `docs/` and names what would void that choice. 108 ADRs, 25 feedback records, 94 changelog fragments | **Nothing.** This is not ambiguity — it is a direct contradiction, and it is the highest-priority item in this audit. See below |
| `scripts/audit-collection.mjs`, `backfill-finish`, `backfill-generations`, `backfill-rarity-types`, `cardmarket-links`, `pokedex-art`, `pokedex` (7 files) | knip calls them unused; they are one-off data migrations, and `backfill-rarity-types.mjs` is named in ADR-0030 as the script that produced the current data | Whether any is still needed. They read like history, but deleting the script that produced your rarities feels like burning the receipt |
| `scripts/snapshot-collection-value.mjs` | ADR-0044 records it was broken for everyone once `/cards` became a redirect | Whether it was ever repaired, or whether the cron replaced it entirely |

### The contradiction, stated plainly

**This brief asks me to dissolve 108 decision records into one `CONVENTIONS.md`
and delete the originals. `CLAUDE.md` — the binding instruction file for this
repository — forbids exactly that.**

Both cannot hold. The arguments, so you can choose:

- **For the brief.** 244 markdown files is a lot to hand a new developer. Records
  do contradict each other (ADR-0059 said "not now" and ADR-0095 says "now";
  ADR-0056 was partly superseded by ADR-0061). A rule in the present tense is
  more useful than an argument from March.
- **Against.** The records are *why*, not *what*, and this session alone used
  them six times to avoid re-making a settled mistake — ADR-0012's cascade bug,
  ADR-0017's conditional-reset trap, ADR-0018's grep-before-delete, FB-0023's
  "leave the vendored files", ADR-0059's parked Combobox, ADR-0057's naming
  collision. A `CONVENTIONS.md` line saying "features do not import each other"
  does not carry the measurement that made it true. And the migration you just
  approved was steered by them.

**My recommendation: do both, and delete nothing.** Write `CONVENTIONS.md` as
the rules in the present tense — that is genuinely missing and is finding #4.
Keep `docs/decisions/` as the reasoning behind them, and have `CONVENTIONS.md`
link each rule to the record it came from. You get the one document you asked
for; you keep the receipts. **But this is your call, and I have not touched a
single record.**

### The rest of the cleanup list

| Path | What it is | Outcome | Why |
|---|---|---|---|
| `MIGRATION.md` | Phase 0 report + A1–A5 assumptions, all resolved and marked so | **Delete — after** finding #4 is done | It is currently the only place the target structure is written down |
| `.context/plans/*.md` (3), `.context/todos.md` | Session scratch, gitignored | Leave | Not in the repository |
| TODO / FIXME / HACK / `@deprecated` in `src/` | **0 found** | — | `grep -rnE "TODO\|FIXME\|HACK\|XXX\|@deprecated" src scripts` → empty |
| Commented-out code | **0 found** | — | The 6 hits are prose comments containing punctuation, not code |
| Migration shims in `src/` | **0** | — | `@/*` is back to `["./src/*"]`, the dual alias is gone (A2), `lib/design/theme-values.ts` was replaced by the generated file |
| Feature flags permanently on/off | **0 found** | — | |
| `docs/changelog.d/` (94 fragments) | Unreleased changelog entries | Question for you | 94 fragments and `docs/CHANGELOG.md` exists — has a release ever consumed them? |

---

## 4b. Proposed rule set

Written as `CONVENTIONS.md` would be. **Not created** — this is the proposal.

| # | Rule | Enforcement | From |
|---|---|---|---|
| 1 | A feature does not import another feature | **Enforced** — `eslint.config.mjs:135` | this migration |
| 2 | A feature does not import a route; routes compose features | **Enforced** — `eslint.config.mjs:139` | this migration |
| 3 | `components/shared/` does not know about a feature | **Enforced** — `eslint.config.mjs:166` | this migration |
| 4 | A component used by exactly one route lives in that route's `_components/` | Reviewed | this migration |
| 5 | `styles/theme.css` is the only place a design value is written | **Enforced** — `verify.sh` tokens step regenerates and fails on a diff | ADR-0093 |
| 6 | Untitled UI is the default; a local value must earn the exception with the identity or a measurement | Reviewed | ADR-0056 |
| 7 | The product identity is the holographic shine and the card tilt. Nothing else | Reviewed | ADR-0061 |
| 8 | No `@apply`, no `@layer components`. A shared utility string lives in one constant or one component | Reviewed | ADR-0007 |
| 9 | Do not name a token what Tailwind names one, unless replacing it app-wide on purpose | **Loose intent** — nothing checks it | ADR-0057 |
| 10 | Grep the whole tree for a class name before deleting its CSS | **Loose intent** | ADR-0018 |
| 11 | Vendored Untitled UI is exempt from this project's lint and format, not from `strict` | **Enforced** — `tsconfig.vendored.json`, per-file exemptions | ADR-0062, ADR-0066 |
| 12 | One icon set: `@untitledui-pro/icons` | **Enforced** — `scripts/untitled-add.mjs` rewrites and drops the second package | ADR-0067, ADR-0083 |

**Loose intents that nobody can check** — rules 9 and 10. By your own standard
these are not rules. Rule 9 could become a test (an allowlist of Tailwind
namespaces this project owns); rule 10 cannot be automated and should probably
be a line in `CONVENTIONS.md` rather than pretend to be enforced.

**Rules the code does not follow** — none of the twelve. The one candidate,
rule 5, survives on a technicality worth naming: `theme-values.generated.ts`
contains hex, but it is generated from `theme.css` and `verify.sh` fails if the
two disagree.

**Contradictions between records** — three, all already resolved by supersession
rather than left open: ADR-0059 → ADR-0095 (Combobox), ADR-0056 → ADR-0061
(identity list), ADR-0013/0054 → ADR-0093 (token layer). The supersession
mechanism worked; this is the argument for keeping it.

---

## 5. What I could not verify

| | Why | What I need |
|---|---|---|
| **Whether the site renders correctly in production** | Nothing is pushed; 22 commits, no deploy, no preview URL | Push the branch — Vercel builds a preview for any branch, PR or not |
| **Visual regressions across the CSS rebuild** | The Playwright baselines were deleted with `cards-css.spec.ts`, and ADR-0069 requires baselines from a reference commit in a separate worktree | A baseline run against `origin/main` in a worktree |
| **Mobile and tablet** | I verified 1461px only, in one browser | A run at 390 / 800 / 1280 |
| **Whether the 42 unused vendored files are truly unreachable** | knip is static; a runtime-composed import would not show | Nothing cheap. FB-0023 already chose to keep them |
| **Whether the colour changes are acceptable** | `labelSecondary` went `#666666` → `#404040`, `labelTertiary` `#737373` → `#525252`. Higher contrast, so better — but it also changes both OG images and the browser chrome colour | Your eye on a shared link preview |
| **Accessibility beyond the mechanical check** | I checked for `<div onClick>` (1 hit: `Modal.tsx:361`, the backdrop, which has Escape handling beside it) and server/client leaks. No screen reader was run | A real assistive-technology pass |
| **Whether `docs/changelog.d/`'s 94 fragments were ever released** | No release tooling in `package.json` | You |

---

## 6. The three future-proof questions

**Can a new developer add a feature independently within a week? — No.**
Not because the structure is wrong, but because it is written down nowhere:
`README.md` and `CLAUDE.md` do not mention `src/`, `features/` or `_components/`
(finding #4). The lint rules would teach them the boundaries by failing, which
is a slow way to learn a convention.

**Can a feature be removed without archaeology in five other folders? — Yes.**
`features/collection` and `features/account` have zero edges to each other and
zero into routes; deleting one means deleting its folder and the routes that
import it, and eslint fails loudly if anything is missed.

**Can Untitled UI be updated without merge hell? — Yes, and better than before.**
`scripts/untitled-add.mjs` now absorbs six things the generator breaks, proved
by reproducing its damage and re-running. Two caveats: `src/utils/` and
`src/hooks/` are mixed directories with per-file exemptions (finding #10), and
`components/base/select/` was pruned by hand to four of the eight files the CLI
installed — a re-run will bring the other four back.

---

## 7. Acceptance criteria

| | Criterion | Evidence |
|---|---|---|
| ✅ | Clean install + typecheck + lint + test + build green, zero ignored warnings | `rm -rf node_modules .next && npm install` then all four → exit 0. `--max-warnings 0`. Build warnings: 0 |
| ✅ | No hardcoded design value in `src/`; `theme.css` demonstrably the only source | 0 palette classes, 0 hex outside the generated file, 0 `@theme` outside `theme.css`. `verify.sh` regenerates and fails on a diff |
| ❌ | Every title from the token set, and the same kind of title identical everywhere | Finding #5. Weight is not tokenised at all; page titles come in four sizes |
| ⚠️ | No cross-feature imports; knip and depcheck clean | Cross-feature: **0** ✅. knip: 42 unused files, 2 unused deps, 1 unlisted ❌ |
| ✅ | No `any`, `@ts-ignore` or `as any` without explanation | 0 in first-party code; the 4 in vendored `is-react-component.ts` are exempt by ADR-0062 |
| ✅ | Server/client boundary correct | 0 server-only imports in client components. 111 `use client` of 284 files, but 79 of those are vendored |
| ❌ | One document describes the current state, structure included | Finding #4 — no document does |
| ❌ | `MIGRATION.md` gone, everything in it processed | Still present, and currently the only record of the target structure |
| ❌ | All decision documents merged into one rule set | **Blocked on your decision** — see section 4, the contradiction |
| ✅ | No commented-out code, no ownerless TODOs, no migration shims | 0 / 0 / 0, all three greps empty |
| ❌ | One active enforcement mechanism for token discipline | `verify.sh` enforces the token *file*; nothing enforces that a title uses it. Section 3 proposes `<Heading>` |

**7 of 11.** The four open ones are findings #4, #5, the knip result, and one
decision that is yours.

---

## 8. Ground to build on

### Adding a feature, in five lines

1. Route in `src/app/<route>/page.tsx` — routing and data fetching only.
2. UI that only that route uses → `src/app/<route>/_components/`.
3. UI shared across routes but owned by one domain →
   `src/features/<domain>/components/`; hooks in `hooks/` beside it.
4. UI with no domain (Button, Modal, FormField) → `src/components/shared/`.
   Search Untitled UI first — that is the standing rule, not a preference.
5. Never import another feature. Cross-links go in the route that needs both, or
   into `lib/`. Eslint will stop you.

### The three places this will drift first

1. **`components/shared/`.** It went from 48 files to 19 by taking a domain out.
   The pressure that made it 48 has not gone anywhere: the next component with
   no obvious home lands there, and nothing fails. Rule 4 is *reviewed*, not
   enforced.
2. **Titles.** Four sizes and three weights already claim to be the page title,
   and nothing prevents a fifth. This is the one place the codebase has already
   drifted while the tokens stayed perfectly correct.
3. **`src/utils/` and `src/hooks/`.** Mixed vendored and first-party, exempted
   per file across four config files. One `ui:add` puts a file there that three
   of the four do not know about, and the failure is a lint error nobody wrote.

### Deliberately left, and when it will start to hurt

- **`lib/core`'s 52 modules stay outside `features/`.** Fine at this size. It
  starts to hurt at the third domain, when "which feature owns `matching.ts`"
  has three plausible answers.
- **`CardsView.tsx` is 1,760 lines.** It works and it is tested through its
  routes. It becomes the reason a change takes a day the first time two people
  touch it in one week.
- **42 unused vendored files, ~6,650 lines.** Costs nothing today — they are not
  bundled. They cost the next `npx untitledui upgrade`, which will offer to
  update all of them.
- **No zod on 15 of 28 API routes.** The hand-written validators are good where
  they exist. This bites when a route grows a field and the validation is three
  files away from the type.
