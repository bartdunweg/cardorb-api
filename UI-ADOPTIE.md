# Untitled UI adoption — where we stand, and what to do next

Investigation only. Nothing was changed. Every claim carries a `file:line`, a
command output, or an MCP catalogue result.

Run in a session that wrote none of this code and read no previous report first.
The earlier `UI-ADOPTIE.md` opens by stating it ran in the session that did the
migration; it is at `git show 2b12ef3:UI-ADOPTIE.md`.

---

## 1. Adoption today, in numbers

| | Count |
|---|---|
| Vendored Untitled UI component files | 29 — 23 `base/`, 3 `application/`, 2 `foundations/`, 1 `shared-assets/` |
| Vendored `base/` groups, all with first-party consumers | 12 |
| Our own components in `components/shared/` | 17, plus 2 class-constant modules |
| …that wrap or compose an Untitled UI component | 5 |
| …with an Untitled UI equivalent we are **not** using | **1** |
| …genuinely without an equivalent | 11 |
| Feature and route components | 41 |
| …importing a vendored primitive | 26 of 41 |
| Competing UI dependencies | **0** |
| Licence tier | PRO (`has_pro_access: true` from the catalogue) |

**One line: adoption is high and mostly honest.** There is no second component
library, no orphaned vendored file, and every wrapper I checked states in its own
header what it overrides and why. One component is the real gap — `Modal.tsx` —
and one surface is unmanaged rather than wrong: 19 hand-styled raw `<button>`
elements.

The vendored tree is also clean. `application/charts`, `application/empty-state`
and `application/table` each have first-party consumers; `foundations/dot-icon`,
`foundations/featured-icon` and `shared-assets/background-patterns` are imported
only by other vendored files, which is what a transitive dependency looks like,
not an orphan. R-UI-007 holds — commit `c38dacf` did the work it claims.

---

## 2. Overlap matrix

Sorted by consumers.

| Component | Uses | Lines | Class | Untitled UI counterpart | Basis |
|---|---|---|---|---|---|
| `Button` | 15 | 183 | 🟡 Bijna | `base/buttons/button` | Wraps it. Header: React Aria's `Link` is not Next's `Link`, so a `<Button href>` needs something in between to route client-side and keep the prefetch. Real difference, thin wrapper, correct per R-UI-002. |
| `FormField` | 9 | 57 | 🟡 Bijna | `base/input` | Already reduced. `FormField`, `FormLabel`, `FormInput` and `FormHint` were deleted in favour of Untitled's `Input`, which wires `aria-describedby` itself. Only `FormForm` — layout, not a control — remains. |
| `SigninShell` | 9 | 93 | ⚪ | — | The four door screens' page shell. App-specific composition. |
| `Card` | 7 | 73 | 🟡 Bijna | Untitled's card surface | Header says the surface is "taken whole"; the wrapper exists for the accent-wash CSS-variable contract, so cards do not each repeat the class string and the `--recent-accent` style object. |
| `Navbar` | 5 | 57 | ⚪ | — | One bar for the landing page and the door screens. App-specific. |
| `Wordmark` | 5 | 137 | ⚪ | — | Brand mark. |
| `Modal` | 4 | **404** | 🟡 **gap** | **`application/modals/*`** | **See section 4.** |
| `Segmented` | 4 | 108 | 🟡 Bijna | `base/button-group` | Wraps it. Overrides exactly one thing — the selected state — and argues it from a measurement: `selected:bg-primary_hover` renders rgb(250,250,250) beside rgb(255,255,255), 1.04:1, where WCAG 1.4.11 asks 3:1. This is what R-STYLE-006's "earn the exception with a measurement" is supposed to look like. |
| `ThemeProvider` | 4 | 190 | ⚪ | — | Light/dark plumbing including the `light-dark()` meta-colour problem. Not a library concern. |
| `MarketingFooter` | 4 | 68 | ⚪ | — | App-specific content. |
| `LegalPage` | 3 | 99 | ⚪ | — | Shell for `/privacy` and `/terms`. |
| `MenuPopover` | 2 | 89 | 🔵 Samenstelling | `base/dropdown` + RAC `Dialog` | Already a composition, and the header records what it replaced: a `<details>/<summary>` with a hand-written outside-click handler. Done correctly. |
| `Sheet` | 2 | 94 | ⚪ | — | Bottom sheet. Searched the catalogue for "slide-over drawer sheet panel from the side or bottom" — nothing relevant returned; the top hits were marketing CTA cards. Untitled UI has `application/slideout-menus`, which is a side panel with menu content, not a phone bottom sheet. Composes our `Modal`, so it inherits section 4. |
| `RouteError` | 2 | 94 | ⚪ | — | The shell every `error.tsx` renders. |
| `MarketingViewerSlot` | 2 | 76 | ⚪ | — | App-specific. |
| `ThemeToggle` | 1 | 29 | ⚪ | — | 29 lines over `base/toggle`. |
| `ViewerPill` | 1 | 49 | ⚪ | — | App-specific. |

`marketingClasses.ts` and `untitledButtonClasses.ts` are class-constant modules,
not components. R-STYLE-014 already scopes the second one.

**On the ⚪ column** — the category the prompt rightly calls the one where
self-deception lives. Eleven entries, and I pushed on each. Nine are app-specific
compositions or content shells that no component library ships (a wordmark, a
legal-page shell, a theme provider). `Sheet` I checked against the catalogue and
found nothing. `ThemeToggle` at 29 lines over a vendored `toggle` is not worth a
wrapper argument either way. I did not find a ⚪ that should have been 🟢.

---

## 3. Legacy signals

Almost none, which is the headline finding after Modal.

| Check | Result |
|---|---|
| Competing UI libraries | **Zero.** No Radix, MUI, Headless UI, react-select, react-modal, react-datepicker, react-toastify, Chakra, Sonner or Vaul. Dependencies are `react-aria-components`, `@untitledui-pro/icons`, `tailwindcss-react-aria-components`. |
| Two icon sets | No. R-STYLE-015 is enforced by `scripts/untitled-add.mjs`, which rewrites imports and drops the second package. |
| Clickable `<div>` / `<span>` | **One** — `Modal.tsx:361`, a dialog backdrop. Conventional, with Escape and a real close button alongside. |
| `createPortal` / focus-trap / high `z-`index | Confined to `Modal.tsx`. Nothing else hand-rolls stacking. |
| Notoriously hard components | Dropdown ✅ vendored, combobox/select ✅ vendored, tooltip ✅ vendored, tabs — no vendored tabs, handled by `Segmented` over `button-group`. Datepicker and toast: not used anywhere. **Modal ❌ hand-rolled.** |

---

## 4. The one real gap: `Modal.tsx`

404 lines. The largest thing we own, and the only one with a counterpart we chose
not to take.

**The counterpart exists.** The catalogue returns six `application/modals/*`
components at PRO, and `get_component stacked-left-aligned-modal` reports a
7-file bundle whose usage example is `<Modal isOpen onClose><ModalContent>`. That
is a shell, not a one-off layout. Commit `e1fc253` already corrected an earlier
claim that it did not exist.

**What we hand-rolled instead:** a portal, a scroll lock that pins the body at its
scroll offset, a focus trap with its own `FOCUSABLE` selector and `isVisible`
predicate, `inert` on the backdrop's siblings, and enter/exit motion.

**The argument for leaving it is weaker than it looks, and the file makes the case
against itself.** `Modal.tsx:23-47` documents a bug this hand-rolled trap shipped:
every filter and view sheet was a keyboard trap below 1000px — which includes a
desktop user at 200% zoom — because the selector omitted form controls and did not
test visibility. React Aria's `Modal` has neither failure mode. Accessibility that
we would otherwise maintain ourselves is the stated reason this project uses
Untitled UI at all; this is the one place we opted out of it and it cost exactly
what the rule predicts.

**The argument for leaving it is not nothing, either.** The scroll-lock comment at
`Modal.tsx:10-20` describes a real problem — `overflow: hidden` alone clamps the
scroll position to zero, so opening a card from halfway down `/cards` snapped the
page to the top. React Aria's overlay scroll lock has its own history here. And
`Sheet.tsx` composes `Modal` for a phone bottom sheet, which is not what Untitled
UI's modals are shaped for.

**Recommendation: do not replace it now.** Two reasons. It is 404 lines of
battle-tested behaviour with four consumers and a bottom-sheet variant layered on
top, and — per `AUDIT.md` finding 1 — **there is no test over any of it**, so a
swap would be a large behavioural change with nothing to catch a regression.

The order is: write `Modal.test.ts` over `FOCUSABLE` and `isVisible` first (the
file already says it exists and it does not), then evaluate the swap against a
suite that can tell you whether it worked.

---

## 5. Unmanaged surface: 19 raw `<button>`s

14 files under `src/features` and `src/app` contain 27 raw `<button>` elements.
13 of those 14 files use neither `Button`, nor a vendored button, nor
`untitledButtonClasses` — 19 bare elements.

**This is not an accessibility defect.** Every one I sampled is
`<button type="button">`, which gives keyboard activation, focus and the right
role for free. Sampling `FilterOptions.tsx:128,139,248` and
`CardsSidebar.tsx:343,390,473`, they are interactive *rows* — `facet-row`,
`facet-back`, `facet-clear`, sidebar navigation rows — styled
`bg-transparent border-none`. They are not buttons as an affordance, and a
React Aria `Button` would not obviously improve them.

**It is a consistency surface.** 19 places each hand-writing their own hover,
focus and transition classes. R-STYLE-014 ("a button is the component") is
`Reviewed`, and this is precisely the surface it is reviewing — currently with no
recorded verdict either way.

**Recommendation:** not a replacement programme. Add one sentence to R-STYLE-014
saying that a transparent interactive row is the exception it allows, so the next
reviewer is not re-deciding it, and the 19 stop reading as drift.

---

## 6. The plan

### Quick wins — today, negligible risk

1. **`Modal.test.ts`** over the two exported predicates. They are pure functions;
   no renderer needed. They are exported for testing and nothing else, and the
   file already claims the test exists. Unblocks everything else about `Modal`.
2. **Write down the R-STYLE-014 exception** for transparent rows. One sentence.
3. **`components.json`** — it does not exist, so `npx untitledui upgrade` has no
   baseline to diff against. Already in `CONVENTIONS.md`'s `## Open`. Creating it
   costs nothing and is the difference between an upgrade you can review and one
   you cannot.

### Main body

4. **Evaluate `Modal` against React Aria's overlay**, once (1) exists. One PR, our
   version deleted in the same PR. Risks per section E of the prompt:
   - *State* — ours is controlled (`open`/`onClose`); RAC's `Modal` is also
     controlled via `isOpen`/`onOpenChange`. Close match.
   - *Focus and portals* — this is the whole point of the change and also the
     whole risk. Focus return to the trigger, `inert` handling and stacking all
     move from our code to theirs.
   - *Scroll* — the highest-risk item. Our pinned-body approach solves a specific
     bug (`Modal.tsx:10-20`); verify RAC's lock does not reintroduce it on
     `/cards` opened from halfway down.
   - *Visual* — our enter/exit uses `motion`'s `animate()` with `SPRING_MODAL`.
     RAC exposes data attributes for CSS transitions instead. The motion has to be
     re-expressed, not ported.
   - *Tests* — none exist to break. That is the problem, hence (1) first.
   - *`Sheet`* — composes `Modal`, so it moves in the same PR or not at all.

### Later or never

5. **The 19 raw rows** — leave. Documented as an exception rather than migrated.
6. **`Button`, `Card`, `Segmented`, `FormField`, `MenuPopover`** — leave. All five
   are already the thin wrapper R-UI-002 asks for, each with its override argued in
   its own header. `Segmented`'s WCAG measurement is the model the others should be
   held to.
7. **The 11 ⚪ components** — leave. No equivalent, checked.

---

## 7. How this is held

Mostly already, and better than most projects manage.

**Already in place:**

- R-UI-001 to R-UI-008 in `CONVENTIONS.md`, with IDs.
- The `## Components` block in `CLAUDE.md` — search first, wrap don't reimplement,
  never hand-edit the vendored trees, and say in one sentence what you searched for
  if you build your own anyway.
- `npm run ui:add` (R-UI-005) wrapping the generator and reporting what it repaired.
- `tsconfig.vendored.json` keeping `strict` on vendored code while dropping the four
  flags the library is not written under — the reasoning is in the file and it is
  the right call.
- Per-tree lint, prettier and tsconfig exemptions.

**The three gaps, in order:**

1. **`components.json` is missing.** Without it there is no recorded version, so
   an upgrade cannot be diffed. This is the one that will hurt.
2. **`src/utils/**` is exempted as a whole directory** though R-UI-008 says per
   file, which sweeps the first-party `cx.ts` under the vendor exemption. See
   `AUDIT.md` finding 9.
3. **Nothing checks R-UI-004** — "say in one sentence what you searched for". It is
   the rule that makes building-outside-the-library visible, and it is honoured
   consistently in this codebase's headers, entirely by discipline. I would leave it
   as `Reviewed`; a lint rule for it would be theatre.
