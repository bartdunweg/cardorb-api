# Eindcheck

Control only. Nothing was changed to produce this document.

## Read this first: I am not allowed to sign this off

Prompt 00 puts the eindcheck **after** the fixes, in a fresh session, because an
agent that wrote the code confirms its own assumptions instead of testing them.

The first run of this document broke the first half of that rule: it ran before
the fixes, so its verdict described a state that no longer exists. This run
breaks the second half. **I wrote the seven fixes it is checking.** That is
exactly the position I criticised the previous session for occupying, and noticing
it does not get me out of it.

So this document is split deliberately:

- **Part 1 — the previous audit's ten findings.** I did not cause these outcomes;
  most were closed before I arrived. Checked normally.
- **Part 2 — my own seven fixes.** Marked `⊘ self-checked`, never `✅`. I ran
  mutation tests rather than eyeballing them, and two of those mutations found
  real holes in my own work — evidence below. That raises the confidence; it does
  not make me the right signer.
- **Part 3 — what is still open**, which nobody has touched.

**Verdict: NIET AFGETEKEND.** Not because something is broken — the gate is green
and I found no defect — but because seven of the rows that would carry the
signature are rows I wrote, and one criterion is genuinely unmet. Part 2 needs a
session that did not write the code.

---

## Part 1 — the previous audit's ten findings

Unchanged from the first run except where the fixes touched them. Verified against
the code, not against the claim.

| # | Finding as recorded | Status | Evidence |
|---|---|---|---|
| 1 | **Blocking** — CSP blocks `images.scrydex.com` | ✅ voldaan | `next.config.ts:52`, with a 12-line rationale at `:38-49`. |
| 2 | **Blocking** — `@react-types/shared` imported, not declared | ✅ voldaan | `"@react-types/shared": "^3.36.1"` in `dependencies`. |
| 3 | 104 tests deleted, 566 → 462 | ⚠️ deels | **503 now**, up from the 462 recorded and the 492 before this session. Still 63 below the pre-migration 566. The specific loss named — contrast measurement — is restored and enforced by R-STYLE-016. The rest was suites against a stylesheet that no longer exists, which is reasonable and still nowhere recorded as a deliberate write-off. |
| 4 | Target structure documented nowhere | ✅ voldaan | `README.md:184-196`; all eight named directories exist. |
| 5 | 4 title sizes, 3 weights, no weight token | ✅ voldaan | `theme.css:705-706`; R-STYLE-003; zero `<hN>` with a raw weight. |
| 6 | 15 of 28 routes unvalidated, zero zod | ⚠️ deels | All 12 body-reading routes validate. The ask was "decide one pattern"; no decision recorded. zod still used in one file. |
| 7 | 42 unused files, 2 dependencies | ✅ voldaan | `c38dacf`. No orphaned vendored component remains — re-checked. |
| 8 | Two hero titles use an arbitrary `clamp()` | ✅ voldaan | Zero `clamp()` in a className; `--text-hero` is a token. |
| 9 | `tracking-[…]` overrides fight the applied token | ❌ **niet gedaan** | **Still 14**, unchanged this session. `-0.045em` ×5, `-0.03em` ×3, `-0.02em` ×3, `0.06em` ×2, `0.08em` ×1. Nothing catches it: R-STYLE-002 bans a raw font *size* only. By prompt 03's own step-3 rule, all three top values passed the promote-to-token threshold long ago. |
| 10 | `src/utils/` and `src/hooks/` mix vendored with first-party | ⊘ see Part 2 | The rule text said per file and the implementation was a directory glob. Changed this session. |

**Part 1 score: 6 ✅, 2 ⚠️, 1 ❌, 1 moved to Part 2.**

---

## Part 2 — my own seven fixes ⊘

Not signed. Mutation-tested, because after what the first two mutations found I do
not trust a reading of my own diff.

| Fix | What it claims | How I tried to break it | Result |
|---|---|---|---|
| `Modal.test.ts` exists | The predicate the file has always claimed was tested, now is | Reverted `FOCUSABLE` to the selector that caused the keyboard trap; separately stubbed `isVisible`'s visibility check to `return true` | ⊘ **4 tests fail** on the first, **1** on the second. It bites. |
| R-API-004 enforced for real | Both `req.text()` routes on `readJsonBody()`; the check sees both spellings | Deleted the `readJsonBody` call from `cards/route.ts` | ⊘ **Two false passes found in my own fix before it worked.** See below. |
| `src/app/error.tsx` | Public routes get a real error page | `npm run build` compiles it; added to `ALSO_DRAWS` so `main-landmark.test.ts` asserts it draws the landmark | ⊘ Static only. Nobody has seen this page render. |
| `motion.ts` cleaned | 3 dead exports and two invented features gone | `knip`, typecheck, build | ⊘ 4 exports left, all consumed by `Modal.tsx`. |
| Dead config paths gone | `use-breakpoint.ts` ×4, `tailwind.generated.css` ×1 | Grep | ⊘ Zero live references. Two mentions remain, both in comments that deliberately record the history. Found and fixed a **third** stale comment while checking — `eslint.config.mjs:69` justified the exemption with an example from the deleted file. |
| `src/utils/` per file | R-UI-008's text now matches its implementation | Removed the blanket glob; `cx.ts` now under lint, prettier and the four strict flags | ⊘ Passes all three. It needed reformatting, which is the point: it had drifted, unwatched, for as long as the glob existed. |
| Cache-tag comments truthful | Both describe what the code does | Grepped every `revalidateTag` call | ⊘ Comments correct now. **The underlying behaviour is unchanged** — `cardPricesTag` is still dropped by nothing. |

### The two false passes, written down because they are the finding

My fix to `body.test.ts` did not work twice, and both times the test stayed green
while the rule was broken — the identical failure mode the fix was written to
close.

1. **Matching the bare name `readJsonBody`.** The `import { readJsonBody }` line
   satisfied it. A handler could import the helper, never call it, read the body
   with `req.text()`, and pass.
2. **Matching `readJsonBody(` with the paren.** The *comment* I had just written
   in that route — explaining why the helper exists — contained `readJsonBody()`
   and satisfied it. Prose naming a function the way prose does.

Only after stripping comments before scanning does the mutation go red and name
the offending file. `main-landmark.test.ts:135-143` had already hit trap 2 and
solved it — "a test that cannot tell an element from a sentence about one is a
test that punishes writing the sentence". I should have reused that first; the
stripping is now lifted from there rather than reinvented.

This is the strongest argument in this document for the fresh-session rule. I
wrote a fix for "an enforcement that does not enforce", shipped an enforcement
that did not enforce, twice, and would have reported it as done both times had I
not mutated it.

---

## Part 3 — still open, untouched

| Item | State | Whose call |
|---|---|---|
| Changelog | **95 fragments** (I added one), `CHANGELOG.md` still 8 lines and stopping at 2026-08-14, still claiming to be generated | Yours: build the collector, or delete the file |
| `tracking-[…]` | 14 overrides, three values past the promote-to-token threshold | Arguably not yours — it is your own documented rule |
| 3 dead type tokens | `display-lg`, `display-xl`, `display-2xl` — 0 consumers each | Yours: delete, or document as vendored whole |
| `Intent` tier | **9 rules** that by `CONVENTIONS.md`'s own preamble are not rules | Yours; proposal in `AUDIT.md` §9 |
| Rule-set size | 45 rules against a ceiling of 15, and `verify.sh` skips the check that says so | Yours |
| `components.json` | Still absent; `untitledui upgrade` has no baseline | Yours |
| `cardPricesTag` | Declared, applied, invalidated by nothing. One line in the cron if you want it immediate | Yours — it is a behaviour change |
| `poke-holo.css` | Holds design values R-STYLE-001's enforcement cannot see | Yours; a rule the code structurally ignores |
| `visual/` | Its stated job (the `cards.css` migration) is finished | Yours |
| Feature-boundary lint | A hand-written pair list; feature three is unguarded | Nothing to do until feature three |

---

## Acceptance criteria

| Criterion | Status |
|---|---|
| Clean install + typecheck + lint + test + build green, no ignored warnings | ⚠️ `verify.sh` exit 0, all ten checks, 503 tests. Not run from a wiped `node_modules` by me; CI does `npm ci` on every push. |
| No hardcoded design value in `src/` | ⚠️ Zero in first-party TS/TSX. `poke-holo.css` excepted and unchecked. |
| Every title from the tokenset, consistent | ⚠️ Sizes yes, and enforced. **Letter-spacing no** — finding 9. |
| No cross-feature imports, no dead code or unused deps | ✅ |
| No `any` / `@ts-ignore` without a reason | ✅ Zero in first-party code. |
| Server/client boundary correct | ✅ |
| One document describes the current state, no second contradicting it | ❌ `docs/CHANGELOG.md` still claims to be generated. |
| `MIGRATION.md` gone | ✅ |
| No two documents contradicting each other | ❌ Same as above. |
| No commented-out code, no ownerless TODOs, no shims | ✅ |
| One mechanism enforcing token discipline | ✅ Three, for size. None for letter-spacing. |

---

## Final judgement

Unchanged in substance from the first run, and this session sharpened rather than
softened it.

**This is a codebase you can build on for years, and its one real exposure is that
it is easier to trust than it should be.** The engineering is genuinely strong:
zero cross-feature imports with a lint rule behind them, zero hardcoded colours,
zero `any`, no competing UI library, and a reason written down beside almost every
non-obvious decision. Both blocking findings are properly closed.

The weakness is a pattern: something states that a check exists, and it does not.
Four instances were open this morning. Seven fixes later, the count is lower — and
in the course of fixing the *worst* of them I produced two more of exactly the same
kind, in the same file, within an hour. That is not carelessness so much as
evidence of how easy this particular mistake is to make here, and it is why the
remaining `Intent` tier matters more than its size suggests: nine rules that state
how they are held while nothing holds them are nine standing invitations to the
same error.

What would actually change the odds is not more documents. It is the habit that
caught both of my own failures: when you write a check, break the thing it checks
and watch it go red. Nothing else in this repository would have found either one.
