# Sign-off check

**NIET AFGETEKEND — 12 open points** *(as checked. Eleven have since been closed —
see the section immediately below. The verdict line is left as it was written,
because a check that edits its own verdict afterwards is not a check.)*

---

## What changed after this check was written

This document is a point-in-time reading, and the tree moved once more after it
was taken. Recorded here rather than folded into the rows above, because
rewriting somebody else's check to match a later state is how a check stops being
worth anything.

**One correctness bug, found by re-reading `Modal.tsx` rather than by any test,
and fixed.** `handleGone` cleared its own `closing` state when the exit finished.
For the five call sites that close themselves with a `setState` that lands in the
same React batch, nothing was visible. For the sixth it was: `CardModal`'s `open`
is the literal `true` — the intercepting route's existence *is* the open state —
and its `onClose` is `router.back()`, a navigation. So clearing `closing` put
`open && !closing` back to true, and a card dismissed with Escape **re-mounted and
played its entrance animation** before the route finally went. That is the dialog
opened every time anyone taps a card.

`closing` is now cleared by a change of `open` and by nothing else. Two tests were
added — one that the dialog stays closed when the consumer holds `open` at true,
one that it can still be opened again — and four mutations were run against them,
including restoring the original bug. All four turn the suite red.

**This does not weaken the headline finding below; it sharpens it.** The check
above is right that the modal's timing contract is thinly protected. The bug it
did not catch, and that 518 tests did not catch, was a *second* thing wrong in the
same three lines of state — found by a person reading the code, which is the one
method neither this document nor the test suite is.

**Then the whole user surface was inspected in a browser rather than only the
diff, and that found something worse than anything in the table below.** Every
card in the collection sat in a wrapper with `display: contents`, which has no
layout box, and Chrome will not focus one. Measured on `/user/<name>`: 1,609 of
1,609 focusable candidates in the grid reported zero client rects and none
accepted `.focus()`. **Nobody could reach a card with a keyboard** — WCAG 2.1.1,
level A, on a public page, and it had been true for as long as the component
existed. Fixed at `CardItem.tsx:49`, which now uses `outline-hidden` to do the one
thing `contents` was wanted for. All twenty Playwright tests including every
screenshot pass unchanged, so the layout did not move a pixel. A new browser test
asserts no card is box-less.

Four further points from the list below were closed in the same pass:

| Point | What was done |
|---|---|
| `README.md`'s API table said "Reading is open" | Rewritten. Both routes call `authorise()`; the three genuinely open ones under `/api/v1/public/` now have their own table. This was the last of the two contradicting documents. |
| Finding 11 — `raw.length` counts UTF-16 units | `body.ts` measures bytes now, which is what `content-length` and `BODY_LIMIT` were always in. A cap of 100 accepted 128 bytes of accented text. Test added; reverting the fix turns it red. |
| Finding 5 — three type tokens with no consumer | Documented rather than deleted, in `theme.css`. They are steps of Untitled UI's own scale, and a vendored component arriving after a deletion would render at the browser default rather than fail. Audited as dead three times; now it says why it is not. |
| Finding 13 — `playwright.config.ts` describes a finished job | Header rewritten. It also now records that its baselines are gitignored and that it runs in neither the gate nor CI. |

Two more were closed after that, both of them enforcement gaps rather than
content decisions:

| Point | What was done |
|---|---|
| **Mutation B** — a third feature is unguarded | `eslint.config.mjs` generated the two boundary blocks from `readdirSync("src/features")` instead of naming the pair by hand. Verified with the check's own probe: `src/features/pricing/probe.ts` importing a feature *and* a route linted clean on the old config and reports both violations on the new one. R-STRUCT-001 and R-STRUCT-002 now mean what they say for any feature, including ones that do not exist yet. |
| AUDIT §3 — `src/lib` missing from `ROOTS` | Added. It was already true, which is the only safe moment to widen a rule; planting `text-[13px] tracking-[-0.02em]` in `src/lib/api/guard.ts` turns it red and names the file. |

After all of it: 521 tests, 20 browser tests, `./scripts/verify.sh` exit 0.

Then the owner settled the content decisions, and the last four closed too:

| Point | What was decided, and done |
|---|---|
| `poke-holo.css` holds design values `theme.css` cannot see | **Moved.** Twelve colours — the six sunpillar foil steps, the deep navy and two sheens of the diagonal bar, three shadow alphas — are `--color-foil-*` tokens now and the stylesheet reads them back. A new `stylesheet-discipline.test.ts` fails on any colour literal in `src/styles/` outside `theme.css`, with the file and line; putting `#0e152e` back turns it red. Three audits found this file in turn; nothing will have to find it again. |
| **Mutation A** — the `onClose` contract is unguarded | **Closed, in vitest.** It turned out to be testable after all: React Aria ends an exit on `Promise.all(getAnimations().map((a) => a.finished))`, and jsdom has no animations, so that promise resolved instantly and there was no "during the exit" to observe. Handing it one animation whose `finished` the test controls puts the moment back. The mutation that left 518/518 green now fails four cases. |
| The two validation idioms | **Both kept, and written down as R-API-005.** `zod` at a process boundary that runs once and must fail loudly — `lib/core/env.ts`, and nothing else. Hand-written narrowing for request bodies, after `readJsonBody()` has bounded them. The rule is that the boundary decides, so this stops being re-litigated per route. |
| Screenshot baselines in version control | **No, deliberately, and now argued in `playwright.config.ts`.** They are `-darwin` stamped and there is no CI runner to make them canonical; committing them buys the look of a guarded appearance and none of the guarding. The cost is named in the same paragraph rather than left to be rediscovered. |

`R-STYLE-018` went from `Intent` to half-enforced in the process, which takes the
`Intent` tier from nine to eight and is the shape the rest of that list should
take: find the half of the rule a machine can hold, and hold it.

**Eleven of the twelve are closed.** The twelfth is the rule-set size — 45 rules
against the standard's ceiling of 15, which `verify.sh` still skips for. Getting
under it means retiring thirty rules, and that is a conversation about what this
project wants to promise, not a defect.

---

## Who wrote this, and what that is worth

**I am a subagent, invoked by the session that wrote the code I am checking.** I am
not an independent human review and I am not a separate pair of eyes in the
strongest sense. I did not write any of this code and I was given none of that
session's reasoning — only `AUDIT.md`, `UI-ADOPTIE.md`, `CONVENTIONS.md`,
`README.md` and the repository. But I share a parent with the author, so treat
this as a rigorous self-check, not as an outside audit.

The status labels below (`voldaan`, `deels`, `niet gedaan`, `bewust laten
vervallen`) are Dutch because the brief specified those exact words. That departs
from `CLAUDE.md`'s English-only rule; the request outranks the rule.

**What I verified independently** — everything with a command in the Evidence
column. Every row marked ✅ carries either a command I ran, a `file:line` I read,
or a mutation I made and watched turn a check red. No row is ✅ on the strength of
a document.

**What I could not verify independently:**

- **R-STYLE-015** (`scripts/untitled-add.mjs` drops the second icon package). I
  read the script and confirmed `@untitledui/icons` appears nowhere in `src` or
  `package.json`, but I did not run the generator — that needs network and a
  licence. Reported as evidence-by-inspection, not by mutation.
- **Runtime accessibility and anything a real browser sees.** `visual/owner.spec.ts`
  needs a dev server and baselines that are gitignored. I did not run it. Two of
  the modal's contracts live only there — see the headline finding.
- **Whether the deployment settings are as `R-PLAT-001` and `R-PLAT-002` describe.**
  Cloudflare's proxy mode and Vercel's Build-environment variables are outside this
  repository. Nothing here can check them and neither could I.
- **The reason behind any choice.** Where a document says "deliberately", I checked
  that the code matches the claim, not that the claim is wise.

---

## The baseline, run from a wiped state

```
rm -rf node_modules .next && npm ci   →  exit 0
npm run typecheck                     →  exit 0
npm run test                          →  exit 0   46 files, 518 tests
npm run lint                          →  exit 0   (--max-warnings 0)
npm run build                         →  exit 0   30 routes
./scripts/verify.sh                   →  exit 0
```

`verify.sh`: `secrets` ok, `node v24.19.0` ok, `format` ok, `tokens` ok,
`changelog` ok, `typecheck` ok, `test` ok, `lint` ok, `build` ok,
`conventions` **skipped**, `standards` ok, `record numbers` ok.

This closes `AUDIT.md` section 5's first gap: the clean install is now covered,
and by me.

**The working tree was already dirty when I started** — 21 modified files and 7
untracked, none of it committed. Everything below is checked against the working
tree, which is the code as it stands, not against `HEAD`. I recorded
`git status --porcelain` before and after; the two are identical, so none of my
mutations survived.

---

## The mutation tests

This is the part that decides whether the `Enforced` column is true. Ten
mutations, each made, run, and reversed.

| # | Mutation | Check | Went red? |
|---|---|---|---|
| 1 | `text-[13px]` into a className in `FormField.tsx` | `type-discipline.test.ts` | ✅ yes |
| 2 | `tracking-[-0.02em]` into the same className | `type-discipline.test.ts` | ✅ yes — both axes reported separately |
| 3 | Replaced `readJsonBody(req, BODY_LIMIT.card)` in `cards/route.ts` with a raw `JSON.parse(await req.text())` | `body.test.ts` | ✅ yes — and it caught it while the file still *mentions* `readJsonBody` in its import and its comment, which is the double false pass the test's header documents |
| 4 | `<main id="main-content">` → `<div>` in `brand/page.tsx` | `main-landmark.test.ts` | ✅ yes, 2 tests |
| 5 | `--color-text-tertiary` lightened two neutral steps | `contrast.test.ts` **and** `extract-theme-values.mjs --check` | ✅ yes, both |
| 6 | Added `docs/changelog.d/2026-08-22-mutation-probe.md`, did not collect | `collect-changelog.mjs --check` | ✅ yes |
| 7 | Dropped the `modal-scroll` class hook from `Modal.tsx` | `Modal.dom.test.tsx` | ✅ yes |
| 8 | Removed `isDismissable` from `ModalOverlay` | `Modal.dom.test.tsx` | ✅ yes (backdrop-click test) |
| 9 | Removed `useLockViewportWidth(shown)` | `Modal.dom.test.tsx` | ✅ yes |
| 10 | Cross-feature import, route import, and `shared/` importing a feature | `npm run lint` | ✅ yes, 3 errors with the right messages |
| 11 | Type error inside a vendored file | `tsc -p tsconfig.vendored.json` | ✅ yes — R-UI-006's "exempt from style, not from `strict`" is literally true |
| 12 | Published `purchasePrice` through the public allow-list in `cards.ts` | `cards-public.test.ts` | ✅ yes, 3 tests |

### Two mutations that did NOT go red — headline findings

**A. `onClose` moved from after the exit to the start of it. All 518 tests still
passed.**

```
handleOpenChange:  owed.current = true  →  owed.current = false; onClose()
npm run test  →  46 files, 518 tests, all pass
```

This is the exact contract `Modal.tsx:39` and `UI-ADOPTIE.md` §4 both name as
*the one contract of the old file worth keeping* — `CardModal` calls
`router.back()` in `onClose`, and firing early unmounts the route mid-animation.
The `ExitSignal` component, the `owed` ref and the 250ms fallback timer exist
solely for it, and nothing that runs on a commit protects any of them.

The test file is honest about this — `Modal.dom.test.tsx:170-182` says the timing
half "is in `visual/owner.spec.ts`". I confirmed that case exists
(`owner.spec.ts:203-215`, it waits for `data-exiting`). But `visual/` is in
neither `scripts/verify.sh` nor `.github/workflows/`, and `.gitignore:15` excludes
its baselines. So the check is real, documented, honest — and off.

**B. A third feature is completely unguarded by the boundary lint.**

```
src/features/pricing/probe.ts, importing @/features/collection AND @/app/page
npx eslint src/features/pricing/probe.ts  →  exit 0, no output
```

`AUDIT.md` finding 10 predicted this from reading `eslint.config.mjs:126-162`. I
confirmed it by building the case. R-STRUCT-001 and R-STRUCT-002 read `Enforced`
and are enforced for exactly two named directories.

---

## The table

| Source | Point | Status | Evidence | Notes |
|---|---|---|---|---|
| AUDIT AC | Clean install + typecheck + lint + test + build green, no ignored warnings | ✅ voldaan | `rm -rf node_modules .next && npm ci && npm run typecheck && npm run test && npm run lint && npm run build` → all exit 0. 518 tests. `lint` is `--max-warnings 0` | The audit marked this ⚠️ because it had not wiped. I did. |
| AUDIT AC | No hardcoded design value in `src/`; `theme.css` the only source | ⚠️ deels | Mutation 5 red on both checks. But `poke-holo.css:171-199` still holds `#0e152e` ×3 and eleven `hsl()` stops, and `extract-theme-values.mjs` reads `theme.css` only | Unchanged since the audit. See finding 12 row. |
| AUDIT AC | Every title from the tokenset | ✅ voldaan | Mutations 1 and 2 both red. `grep 'text-\[[0-9]'` over `src` → 0 outside the check itself | The rule was also widened to letter-spacing since the audit, and I verified that half separately. |
| AUDIT AC | No cross-feature imports | ✅ voldaan | Mutation 10; `ls src/features` → `account`, `collection` only | True today. Not structurally held — see the R-STRUCT-001 row. |
| AUDIT AC | No `any` / `@ts-ignore` without a stated reason | ✅ voldaan | `grep -rn "\bany\b\|@ts-ignore\|@ts-expect-error"` first-party → the five in `src/utils/is-react-component.ts`, which is vendored | Re-checked, not taken from the audit. |
| AUDIT AC | Server/client boundary correct | ✅ voldaan | `npm run build` exit 0; no non-`NEXT_PUBLIC_` `process.env` in a `'use client'` file | |
| AUDIT AC | One document describes the current state | ✅ voldaan | `CONVENTIONS.md` exists, 45 rules, `CLAUDE.md` names it as the only binding source | |
| AUDIT AC | `MIGRATION.md` gone | ✅ voldaan | `ls MIGRATION.md` → absent | |
| AUDIT AC | **No two documents contradicting each other** | ❌ niet gedaan | The changelog half is fixed. But `README.md` line 16 says "Reading is open" and its table lists `GET /api/v1/collection` and `GET /api/v1/cards/:tcgId` with no key — while `collection/route.ts:30` and `cards/[tcgId]/route.ts:25` both call `authorise()`, and the docstring says "Behind the key since /user/<name> exists" | **Fix: correct the README API table.** ~10 minutes. `CLAUDE.md` warns about this exact class of error in the paragraph starting "Do not 'fix' the guard back off". The audit's own criterion is still failed, just somewhere else. |
| AUDIT AC | No commented-out code, no ownerless TODOs | ✅ voldaan | `grep -rn "TODO\|FIXME\|HACK\|XXX\|@deprecated"` first-party → 0 | |
| AUDIT AC | One active mechanism enforcing token discipline | ✅ voldaan | Three, all mutation-proven: mutations 1, 2 and 5 | |
| AUDIT 1 | `Modal.tsx` claims a test that does not exist | ✅ voldaan | `Modal.dom.test.tsx` (18) + `Sheet.dom.test.tsx` (6) = 24 tests that render the component. `FOCUSABLE` and `isVisible` are gone from `Modal.tsx` entirely | Superseded rather than fixed as written: the predicates the audit wanted tested no longer exist. That is the better outcome. |
| AUDIT 2 | R-API-004 `Enforced` but its test cannot see two routes | ✅ voldaan | Mutation 3. `body.test.ts:99` regex is now `/\breq(uest)?\.(json\|text)\(\)/` with `readJsonBody\s*\(` as the only exemption, and comments stripped first | Both escapes closed, and the fix is itself mutation-tested in the file's own header. |
| AUDIT 3 | Changelog claims to be generated and no generator exists | ✅ voldaan | Mutation 6. `scripts/collect-changelog.mjs`, wired into `verify.sh` and `package.json`. 150 entries from 96 fragments, 382 lines | The generated output concatenates fragments verbatim, so 2026-08-22 mixes bullets with bold free-form paragraphs. Cosmetic, not a rule breach. |
| AUDIT 4 | No error boundary on the public surface | ✅ voldaan | `src/app/error.tsx` exists, alongside `(app)/error.tsx` and `(app)/collection/browse/error.tsx` | No `global-error.tsx`, which the audit did not ask for. |
| AUDIT 5 | Three type-scale tokens with no consumer | ❌ niet gedaan | `--text-display-lg/xl/2xl` still at `theme.css:64-74`. `grep -rn "text-display-\(lg\|xl\|2xl\)" src` excluding `theme.css` → **0 hits**. R-STYLE-004 gained no line about the display scale | **Fix: one decision, then one line.** Either delete three token triplets, or add a sentence to R-STYLE-004 saying the display scale is vendored whole and runs to `2xl`. ~15 minutes. The audit's own status note admits this is open. |
| AUDIT 6 | `lib/core/motion.ts` describes another product | ✅ voldaan | `ls src/lib/core/motion.ts` → absent. `grep -rn "core/motion" src` → 0. `"motion"` is gone from `package.json` | Deleted outright rather than trimmed — a stronger fix than the audit asked for, and correct, since `Modal.tsx` no longer needs a spring. |
| AUDIT 7 | Config names three files that do not exist | ✅ voldaan | `grep -n "use-breakpoint\|tailwind.generated"` across `eslint.config.mjs`, `.prettierignore`, `tsconfig.json`, `tsconfig.vendored.json` → only two *comments* in `eslint.config.mjs:72,86` explaining the removal | The comments are a deliberate record, not a live entry. Correct. |
| AUDIT 8 | Two cache-tag comments have swapped truth | ✅ voldaan | `value-snapshot.ts:38-47` now says the cron does revalidate and points at `cardPricesTag` as the one in the old position. `collection.ts:265-272` says the one-hour TTL is the whole mechanism and names the one-line fix | The wiring itself is deliberately left as the owner's call, which the audit said it should be. |
| AUDIT 9 | `src/utils/**` exempted as a directory | ✅ voldaan | `eslint.config.mjs:102`, `.prettierignore:36`, `tsconfig.json:53`, `tsconfig.vendored.json:39` all name `src/utils/is-react-component.ts` per file. `cx.ts` is back under the project's rules | All four places, as R-UI-008 requires. |
| AUDIT 10 | Feature-boundary lint enumerated per pair | ⚠️ deels | **Mutation B**: `src/features/pricing/probe.ts` importing both a feature and a route → `eslint` exit 0. `## Open` in `CONVENTIONS.md` gained no line about it | The audit said "nothing now" but "worth a line in `## Open`", and that line was not written. **Fix: one line in `## Open`, ~2 minutes.** The real work — one `zones` rule replacing both blocks — is still correctly deferred to feature three. |
| AUDIT 11 | Body limits named in bytes, measured in UTF-16 code units | ❌ niet gedaan | `body.ts:76` is still `if (raw.length > limit)`. Constant is still `BODY_LIMIT` | **Fix: `new TextEncoder().encode(raw).length`, one line, ~5 minutes** — or rename the constants. Bounded and not exploitable at these limits; the name and the behaviour still disagree. |
| AUDIT 12 | `poke-holo.css` holds design values R-STYLE-001 cannot see | ❌ niet gedaan | `poke-holo.css:171-176` and `:194-199` still carry `hsl()` and `#0e152e`. `## Open` has no entry for it | The audit explicitly said this must go to `## Open` rather than be decided by an agent. It went nowhere. **Fix: three lines in `## Open`, ~5 minutes.** Leaving it out means the collision between R-STYLE-001 and R-STYLE-007 is undocumented. |
| AUDIT 13 | `visual/`'s stated job is finished | ❌ niet gedaan | `playwright.config.ts:4` still reads "for one job: making the Tailwind migration of `cards.css` safe" and `:17` "before moving another rule out of `cards.css`". `cards.css` does not exist | **Worse than when the audit was written.** `visual/owner.spec.ts` gained 96 lines of modal cases this session, which are now the *only* holder of two Modal contracts — so the file's header describes a purpose it has outgrown twice over. **Fix: rewrite the header, ~20 minutes.** |
| AUDIT 14 | Two validation idioms | ❌ niet gedaan | `zod` still in `dependencies`, still used only in `src/lib/core/env.ts`. Zero zod under `src/app/api`. No rule names a winner | The audit rated this "Later" with no size. **Fix: one rule in `CONVENTIONS.md`, ~10 minutes.** Not a hole — everything is validated — but the next route author still has two patterns and no guidance. |
| AUDIT §3 | Recommendation: add `src/lib` to `type-discipline.test.ts` ROOTS | ❌ niet gedaan | `type-discipline.test.ts:42` — `ROOTS = ["src/app", "src/features", "src/components/shared", "src/providers"]` | The audit called this "costs nothing and closes it before something does". **Fix: one array element, ~2 minutes.** Nothing escapes today; I re-checked. |
| UI-ADOPTIE §1 | 32 vendored files: 25 base, 4 application, 2 foundations, 1 shared-assets | ✅ voldaan | `find` per tree → 32 total, split exactly 25/4/2/1 | |
| UI-ADOPTIE §1 | Zero competing UI dependencies | ✅ voldaan | `grep -nE "radix\|@mui\|headlessui\|react-select\|react-modal\|vaul\|sonner\|lucide\|chakra" package.json` → 0. `grep -rn "lucide" src` → 0 | |
| UI-ADOPTIE §3 | Zero `createPortal`, zero hand-rolled focus trap, zero z-index over 99 | ✅ voldaan | `grep -rn "createPortal" src` → 0. `grep -rn "z-\[1[0-9][0-9]" src` → 0 | |
| UI-ADOPTIE §4 | `Modal` replaced by `application/modals/modal`, 404 → 236 lines | ✅ voldaan | `wc -l src/components/shared/Modal.tsx` → 236. `Modal.tsx:4-8` imports `Dialog`, `Modal as UntitledModal`, `ModalOverlay` from `@/components/application/modals/modal` | |
| UI-ADOPTIE §4 | Tests written *before* the swap, 7 mutations run against them | ⚠️ deels | I can verify the tests exist and are strong — 9 of my 12 mutations landed on them and all went red. I **cannot** verify they were written first: `Modal.test.ts` is deleted and `Modal.dom.test.tsx` is untracked, so there is no commit ordering to read | This is a row I have to take on the document's word, and I am declining to mark it ✅. |
| UI-ADOPTIE §4 | `onClose` fires after the exit, not at its start | ❌ niet gedaan (as an enforced contract) | **Mutation A**: fired it at the start; 518/518 still pass. The only check that would catch it is `visual/owner.spec.ts:203-215`, which is in no gate | The behaviour is correct in the code. What is missing is anything that keeps it correct. **Fix: see "what fell between the cracks" below.** |
| UI-ADOPTIE §5 | 27 raw `<button>`s in 14 files, recorded as an exception | ✅ voldaan | `grep -rn "<button" src/features src/app --include='*.tsx'` → **27** in **14** files. R-STYLE-014 gained the sentence — see the diff of `CONVENTIONS.md` | Numbers match exactly. |
| UI-ADOPTIE §6.1 | `components.json` created | ✅ voldaan | `cat components.json` → `version: 8` + the four aliases. `## Open`'s entry about it is removed | |
| UI-ADOPTIE §6.2 | R-STYLE-014 exception written | ✅ voldaan | `git diff CONVENTIONS.md` shows the added sentence | |
| UI-ADOPTIE §6.3 | `stacked-left-aligned-modal.tsx` deleted | ✅ voldaan | `find src -name "*stacked*"` → nothing. `ls src/components/application/modals/` → `modal.tsx` only | **Actually deleted, not merely unused.** This is the row the brief specifically asked about, and it holds. |
| UI-ADOPTIE §6.4 | Rewrite the three callers' className contract into real props | ⚠️ deels | `Modal.tsx:227,229` still ship `modal-close` and `modal-scroll`; `cardModalClasses.ts` and `Sheet.tsx` still drive them from outside | Openly declared "deliberately left undone", so this is a known debt, not a broken promise. **Cost: three files, purely visual, and mutation 7 proves the test catches a dropped hook.** ~1 hour. |
| UI-ADOPTIE §6.5 | Try `Sheet` against `application/slideout-menus` | ⚠️ deels | `Sheet.tsx` is 93 lines composing our `Modal`. No trial recorded anywhere | Scoped by the document itself at "thirty minutes and no more". Still unspent. |
| UI-ADOPTIE §7 gap 2 | The screenshot suite has no baselines under version control | ❌ niet gedaan | `.gitignore:15` — `visual/**/*-snapshots/`. `grep "playwright\|visual"` over `scripts/verify.sh` and `.github/workflows/*.yml` → **no match** | The document calls this "the most valuable check in the repository and it is switched off by default", then leaves it switched off *and* moves two irreplaceable contracts into it. **This is the single biggest open point.** |
| CONVENTIONS | R-STRUCT-001 — Enforced, `npm run lint` | ⚠️ deels | Mutation 10 red for the named pair; **mutation B** exit 0 for a third feature | Enforced for `collection` and `account` by name. Not structural. |
| CONVENTIONS | R-STRUCT-002 — Enforced, `eslint.config.mjs` | ⚠️ deels | Same as above — a route import from `features/pricing/` is not caught | |
| CONVENTIONS | R-STRUCT-003 — Enforced, `eslint.config.mjs` | ✅ voldaan | Mutation 10: `shared/Wordmark.tsx` importing `@/features/collection` → error with the right message | This one *is* structural: it matches `src/components/shared/**`. |
| CONVENTIONS | R-STYLE-001 — Enforced, `extract-theme-values.mjs --check` | ⚠️ deels | Mutation 5 → exit 1, correct message. But it reads `theme.css` only, so `poke-holo.css` is invisible to it | Same gap as AUDIT finding 12. |
| CONVENTIONS | R-STYLE-002 — Enforced, `type-discipline.test.ts` | ✅ voldaan | Mutations 1 and 2, both red, reported per axis | The rule text was widened to letter-spacing this session and the check was widened with it. Verified together. |
| CONVENTIONS | R-STYLE-015 — Enforced, `scripts/untitled-add.mjs` | ⚠️ deels | Read `untitled-add.mjs:209-231,279`: it strips `@untitledui/icons` from `package.json` and rewrites imports to `@untitledui-pro/icons/line`. `grep -rn "lucide\|@untitledui/icons" src package.json` → 0 | **Not mutation-tested.** Running the generator needs network and a PRO licence. The outcome is right; the mechanism I verified by reading only. |
| CONVENTIONS | R-STYLE-016 — Enforced, `contrast.test.ts` | ✅ voldaan | Mutation 5 → 2 tests red out of 22, with the offending token pair named in the message | |
| CONVENTIONS | R-UI-006 — Enforced, `tsconfig.vendored.json` | ✅ voldaan | Mutation 11: `const mutationProbe: string = 1` in `close-button.tsx` → `TS2322` under the vendored config. `npm run lint` still exit 0 | Both halves of the rule are literally true. |
| CONVENTIONS | R-API-004 — Enforced, `body.test.ts` | ✅ voldaan | Mutation 3 | |
| CONVENTIONS | R-PLAT-003 — Enforced, `main-landmark.test.ts` | ✅ voldaan | Mutation 4 → 2 tests red | |
| CONVENTIONS | R-API-001 — the three public routes each have their own limiter | ✅ voldaan | All three of `public/[username]/{collection,latest-pull,cards/[tcgId]}/route.ts` call `createRateLimiter(60_000, 60)` | Reviewed-tier and I checked it anyway, because it is the security boundary. |
| CONVENTIONS | R-API-002 — public collection exposes exactly `rarity` and `owned` | ✅ voldaan (**and under-claimed**) | Mutation 12: publishing `purchasePrice` turned 3 tests red in `cards-public.test.ts` | **The rule says `Reviewed`. It is Enforced.** Fix: change one word in the Enforcement column. ~1 minute. |
| CONVENTIONS | `## Open` — "Nine rules are Intent" | ✅ voldaan | `grep "^| \*\*R-" CONVENTIONS.md \| grep -c "Intent"` → **9**. Total rules → **45** | The count was corrected from ten to nine this session and it is now right. |
| CONVENTIONS | `verify.sh` skips the `conventions` check | ⚠️ deels | `verify.sh` prints `skip conventions — 45 rules vs the standard's 15, and 9 rules marked Intent`. Both figures match reality exactly | The skip is honest and its numbers are true. It is still a check that does not run, and `AUDIT.md` §9's proposed reduction was not carried out. |
| CONVENTIONS | R-PLAT-001, R-PLAT-002 | ➖ bewust laten vervallen | Nothing in this repository can read Cloudflare's proxy mode or Vercel's Build environment | Correctly `Intent`. Not checkable here by anyone, me included. |
| README | The `src/` tree it draws | ✅ voldaan | Checked all 20 paths. Every one exists. `src/types/` and `features/*/actions.ts` are absent exactly as the README says they should be | |
| README | `globals.css` "hard ceiling: 200 lines" | ✅ voldaan | `wc -l src/styles/globals.css` → **199** | One line of headroom. |
| README | `src/app/@modal/` and `src/app/api/cover/` exist | ✅ voldaan | Both present | |
| README | The API table | ❌ niet gedaan | See the "no two documents contradicting" row | |

---

## What fell between the cracks

Points that appear in neither document and stand out now the whole thing is in view.

- **The `visual/` suite is now load-bearing and still not run.** Before this
  session it photographed pages. Now it is the *only* thing that holds the modal's
  `onClose` timing (`owner.spec.ts:203`) and the scroll-offset measurement
  (`:216`). Both were promoted out of jsdom deliberately and for good reasons, and
  both landed in a suite that is in no gate, has no committed baselines, and needs
  a running dev server. The net effect of a well-argued decision is that two
  contracts moved from "untested" to "tested by something nobody runs". That is
  not obviously better, and neither document says it happened.
  **What it costs to fix:** the Playwright cases that assert *behaviour* rather
  than pixels — Escape timing, scroll offset, focus landing — do not need
  baselines at all. Splitting them into their own project and adding one `run`
  line to `verify.sh` is maybe two hours, and it would let the screenshot half stay
  gitignored for the reason `playwright.config.ts:20-31` correctly gives.
- **Three of the four `Enforced` structure rules are enforced by enumeration.**
  R-STRUCT-001, R-STRUCT-002 and the `src/utils`/`src/hooks` exemptions in R-UI-008
  are all hand-maintained lists, and `type-discipline.test.ts`'s `ROOTS` is a
  fourth. Each has a "guards the guard" test that catches a *renamed* directory
  (`main-landmark.test.ts:203`, `type-discipline.test.ts:110`) — which is real
  craft — but none catches a *new* one. The audit spotted this for features; it is
  a pattern, not an instance.
- **`docs/changelog.d/` has 96 fragments and no shape.** The generator concatenates
  them verbatim, so one day's section mixes one-line bullets with three-paragraph
  bold essays. The generator is right to be a pure function of the directory; what
  is missing is any rule about what a fragment looks like. The next 96 will be as
  mixed.
- **`Sheet.tsx` is the one component with no library equivalent, no test of its
  own beyond six cases, and no owner** — `UI-ADOPTIE.md` §7 says so itself and then
  files it under "the gaps, in order" without an action. It composes `Modal`, so an
  Untitled UI update reaches it at one remove.

---

## Deviations that crept in silently

- **The working tree was never committed.** 21 modified and 7 untracked files,
  including the whole modal replacement, `scripts/collect-changelog.mjs`,
  `components.json` and two new test files. Both documents describe this work in
  the past tense as though it had landed. It is real and it is green — I built it
  from a wiped `node_modules` — but it exists only in one working directory.
- **`AUDIT.md` finding 1's fix was silently replaced with a better one.** The audit
  asked for `Modal.test.ts` over two pure predicates. What exists is 24 tests that
  render the component, and the predicates are gone. Nobody wrote down that the
  original instruction was superseded; the audit's status note just says "Fixed: 1".
- **`AUDIT.md` finding 6 was over-executed and correctly so.** The audit asked to
  delete three exports and fix a header. `src/lib/core/motion.ts` was deleted
  outright and the `motion` dependency with it. Right call, larger than the ticket,
  recorded only in `UI-ADOPTIE.md` §4's cost line.
- **R-STYLE-002 changed meaning.** It now covers letter-spacing as well as font
  size, and `type-discipline.test.ts` grew a second axis to match. This is a rule
  amendment, which `CLAUDE.md` says should be proposed in a summary. The
  `CONVENTIONS.md` diff carries it; nothing else announces it.
- **`## Open` lost an entry and gained none.** The `components.json` item was
  correctly removed once the file existed. But `AUDIT.md` explicitly routed *two*
  items to `## Open` — the `poke-holo.css` collision (finding 12) and the
  third-feature cliff (finding 10) — and neither arrived. The section is now
  shorter than the evidence supports, which is the one direction it should never
  drift.
- **`README.md`'s API table drifted out of true and nobody noticed**, in the exact
  way `CLAUDE.md` documents having been burned by once before.

---

## Final judgement

Yes — this is a codebase you can keep building on for years, and it is better than
most things I get asked to check. The reason is specific and it is not the test
count: nearly every non-obvious construction carries its own argument in a comment
beside it, and the arguments are honest ones that name what was measured and what
was guessed. Twelve mutations went red exactly where the `Enforced` column
promised, including three that closed documented false passes; the vendored
boundary is defended in four configs and survives a type error; the security
boundary that matters most, the public allow-list, turns three tests red when you
try to leak a price through it. A newcomer will find out they broke the shape from
a failing check rather than from a reviewer's mood, and that is the property that
makes a codebase survivable.

The failure mode here is not rot, it is a specific and recurring one: **this
project is much better at diagnosing than at closing.** `AUDIT.md` found fourteen
things and seven are still open, including four that cost under fifteen minutes
each and two that the audit explicitly said were not an agent's to decide and must
be written into `## Open` — and they were not written anywhere. `UI-ADOPTIE.md`
names "the most valuable check in the repository" as switched off, in a numbered
gap list, and then moves two irreplaceable contracts into it in the same session.
Both documents are excellent and both end at the point where the work would start
hurting. That is the habit to break, because it has a compounding cost the code
does not: every unclosed finding is a thing the next reader has to re-derive, and
the whole value of writing them down was that they would not have to. Close the
four cheap ones, put the two `## Open` lines in, and get the behavioural half of
`visual/` into `verify.sh` — that is under a day, and it would move my verdict.

---

## Assumptions and open questions

- **I checked the working tree, not `HEAD`.** If the intent was to sign off the
  last commit, every row about the modal, the changelog collector and
  `components.json` is wrong, because none of that is committed.
- **I did not run `visual/owner.spec.ts`.** It needs a dev server and baselines
  that are gitignored, and `CLAUDE.md` warns that ports 3000-3003 may belong to
  another workspace. Every claim about that suite is from reading it.
- **I assumed `AUDIT.md`'s status note ("Fixed: 1, 2, 4, 6, 7, 8, 9") was a claim
  to test, not a fact.** All seven check out. The four it lists as still open also
  check out as still open, plus three more it does not list.
- **I did not judge whether 45 rules is too many.** `AUDIT.md` §9 argues the
  standard's ceiling of 15 is the wrong number for this repo. That is the owner's
  call and I have no basis to overrule it.
- **`git status --porcelain` is byte-identical before and after this check.** All
  twelve mutations were reversed from backups in `/tmp/mutbak/` and each restore
  was verified with `diff`. I created exactly one file: this one.
