# Untitled UI adoption — where we stand, and what to do next

Investigation only. Every claim carries a `file:line`, a command output, or a
catalogue result.

Written from zero against the code as it is today. The previous version of this
document is at `git show 75b93d2:UI-ADOPTIE.md`; it described a codebase whose
largest hand-rolled component has since been replaced, so its central finding no
longer holds and nothing has been carried over from it.

---

## 1. Adoption today, in numbers

| | Count |
|---|---|
| Vendored Untitled UI files | 32 — 25 `base/`, 4 `application/`, 2 `foundations/`, 1 `shared-assets/` |
| Vendored leaf groups | 20 |
| …with a first-party consumer | **18** |
| …transitive only (imported by another vendored file) | 2 groups, plus 6 support files |
| …orphaned | **0** |
| Our own components (excluding tests) | 60 |
| …importing a vendored module directly | **39** |
| …reaching one through a shared wrapper | 3 |
| Competing UI dependencies | **0** |
| First-party import lines pointing into the vendored trees | 62 |
| Licence tier | PRO (`has_pro_access: true` from the catalogue) |

**One line: two thirds of this app's components are drawn with the library, and
the last thing that was not is now.** There is no second component library, no
orphaned vendored file, no hand-rolled portal, no hand-rolled focus trap and no
z-index above 99 anywhere in `src`. What is left of our own is app-specific
composition — a wordmark, a legal shell, a theme provider — plus one surface that
is unmanaged rather than wrong.

The last report's headline was `Modal.tsx`: 404 lines of hand-rolled portal,
focus trap, scroll lock and motion, recommended for replacement *later* because
nothing tested it. It has since been replaced (`src/components/shared/Modal.tsx`,
now 236 lines including a long header, on `application/modals/modal`), and the
tests were written first. That is the single largest change between the two
documents.

---

## 2. Overlap matrix

Sorted by how many files import each. Class is one of 🟢 exact · 🟡 near, wrapped
· 🔵 composed from primitives · ⚪ no equivalent.

### `components/shared/`

| Component | Imports | Lines | Class | Untitled UI counterpart | Basis |
|---|---|---|---|---|---|
| `Button` | 53 | 183 | 🟡 | `base/buttons/button` (`:2`) | Wraps it. React Aria's `Link` is not Next's `Link`, so `<Button href>` needs something in between to route client-side and keep the prefetch. Real difference, thin wrapper. |
| `Sheet` | 14 | 93 | ⚪ | — | Phone bottom sheet. Searched the catalogue for a slide-over/drawer/bottom panel; the nearest is `application/slideout-menus`, a side panel of menu items, not a sheet a thumb drags up. Composes our `Modal`, so it inherits everything below. |
| `Modal` | 13 | 236 | 🟡 | **`application/modals/modal`** (`:8`) | **Changed since the last report — see §4.** |
| `SigninShell` | 16 | 93 | ⚪ | — | The four door screens' page shell. App-specific. |
| `FormField` | 12 | 57 | ⚪ | — | Only the form *layout* wrapper is left; the label, input and hint were deleted in favour of `base/input`, which wires `aria-describedby` itself. |
| `Navbar` | 9 | 57 | ⚪ | — | One bar for the landing page and the door screens. |
| `ThemeProvider` | 7 | 190 | ⚪ | — | Light/dark plumbing including the `light-dark()` meta-colour problem. Not a library concern. |
| `Card` | 127* | 73 | 🟡 | Untitled's card surface | Surface taken whole; the wrapper exists for the accent-wash CSS-variable contract. *The count is inflated: the grep matches `CardItem`, `CardDetail` and friends. |
| `Segmented` | 6 | 108 | 🟡 | `base/button-group` (`:3`) | Overrides exactly one thing — the selected state — and argues it from a measurement: `selected:bg-primary_hover` renders 1.04:1 against the surface where WCAG 1.4.11 asks 3:1. This is what R-STYLE-006's "earn the exception with a measurement" is supposed to look like. |
| `LegalPage` | 6 | 99 | ⚪ | — | Shell for `/privacy` and `/terms`. |
| `MarketingFooter` | 6 | 68 | ⚪ | — | App-specific content. |
| `Wordmark` | 6 | 137 | ⚪ | — | Brand mark. |
| `RouteError` | 4 | 94 | ⚪ | — | The shell every `error.tsx` renders. |
| `MenuPopover` | 3 | 89 | 🔵 | `base/dropdown` + RAC `Dialog` (`:4,:6`) | Composition, and the header records why `Dropdown.Root` was rejected: `role="menu"` breaks a panel whose contents are checkboxes and segmented controls. |
| `MarketingViewerSlot` | 3 | 76 | 🟡 | `base/buttons/button` (`:3`) | App-specific content over their button. |
| `ThemeToggle` | 3 | 29 | 🟡 | `base/buttons/button` (`:4`) | 29 lines over their button. |
| `ViewerPill` | 2 | 49 | 🟡 | `base/avatar` (`:2`) | Identity pill over their avatar. |
| `untitledButtonClasses.ts` | 5 | 99 | 🟡 | `base/buttons/button` `styles` (`:3`) | Their button as a class string, for elements React Aria's `Button` cannot be. Scoped by R-STYLE-014. |
| `marketingClasses.ts` | 5 | 50 | ⚪ | — | Class recipes, not a component. |

### Features and routes

Not listed one by one — 28 of the 41 feature and route components import a
vendored module directly, and the pattern is uniform: the form screens take
`base/buttons/button` + `base/input`, the collection screens take `base/badges`,
`base/checkbox` and `base/button-group`, and the three data-heavy screens take
`application/table`, `application/charts` and `application/empty-state`. The six
that import nothing vendored are layout shells (`AppShell`, `AppSidebar`,
`AppTabBar`, `CollectionScreen`, `CardsProfile`, `TiltScan`).

**On the ⚪ column** — the category the brief rightly calls the one where
self-deception lives. Ten entries. Nine are app-specific compositions or content
shells that no component library ships: a wordmark, a legal-page shell, a theme
provider, a route-error shell, a navbar, a footer, a sign-in shell, a form layout
wrapper, a class-recipe module. The tenth is `Sheet`, which I checked against the
catalogue rather than assumed. I did not find a ⚪ that should have been 🟢.

---

## 3. Legacy signals

| Check | Result |
|---|---|
| Competing UI libraries | **Zero.** No Radix, MUI, Headless UI, react-select, react-modal, react-datepicker, react-toastify, Chakra, Sonner, Vaul or Lucide — not in `package.json` and not in `node_modules`. The only UI runtime deps are Untitled UI's own stack, plus `recharts` (charts) and `hover-tilt` (the card tilt, which is R-STYLE-007 identity). |
| Two icon sets | No. R-STYLE-015 is enforced by `scripts/untitled-add.mjs`, which rewrites imports and drops the second package — observed doing exactly that during this session's `ui:add`. |
| Clickable `<div>` / `<span>` | **Zero in first-party code.** Three in vendored files, all `stopPropagation` on a hint label. |
| `createPortal` | **Zero occurrences in `src`.** |
| Hand-rolled focus trap / outside-click | **Zero.** The only matches are prose in `Modal.tsx:12` and `MenuPopover.tsx:14-20` describing the ones that were deleted. |
| z-index over 99 | **Zero.** |

### The hard components

| | Status |
|---|---|
| Modal | **Vendored**, wrapped — `application/modals/modal` |
| Dropdown | Vendored surface, first-party shell, reason recorded |
| Combobox / Select | Vendored — `base/select/combobox` + `select-item` |
| Tooltip | Vendored — `base/tooltip` |
| Tabs | Deliberately not a tablist. `Segmented.tsx:39-41` explains: built on `ButtonGroup` so nothing announces a tablist that is not one |
| Datepicker | Does not exist in this product |
| Toast | Does not exist in this product |

Every one of the seven is now either the library's or deliberately absent. That
was not true when the last report was written, and Modal is the only line that
changed.

---

## 4. What happened to `Modal`

The previous report's recommendation was **do not replace it now**, on two
grounds: 404 lines of battle-tested behaviour with a bottom-sheet variant layered
on top, and no test over any of it, so a swap would be a large behavioural change
with nothing to catch a regression. That recommendation was overridden by a
direct instruction to replace it and to use Untitled UI as far as possible.

The second ground was met rather than waived. Before anything was replaced, 24
tests were written against the *hand-rolled* component and run green — Escape,
the backdrop click, focus in and focus back, `inert`, the scroll lock, the class
hooks the callers depend on, and both sheets. Seven mutations were run against
them and all seven turned the suite red, including reverting `FOCUSABLE` to the
selector that had caused the shipped keyboard trap.

**What moved to the library:** the portal, the focus trap (`FOCUSABLE` and
`isVisible` are gone), `inert`, Escape, the click-outside, the focus return, and
the enter/exit motion.

**What stayed ours, each with a reason in the file:** the `--lock-vw` custom
property the tab bar reads; the two variants, because Untitled UI's overlay
centres and has no drawer; the `modal` / `modal-scroll` / `modal-close` class
hooks, because `cardModalClasses.ts` and `Sheet.tsx` drive them from outside; the
frosted scrim; and `onClose` firing after the exit rather than at its start,
because `CardModal` calls `router.back()` there.

**Three things only a real browser caught**, and they are the argument for the
Playwright cases now in `visual/owner.spec.ts`:

1. `display: contents` on the dialog element — the obvious way to keep the panel
   and the labelled dialog as one box — makes focus land on `<body>`, because a
   box-less element cannot take focus. jsdom cannot see it. The filter sheet was
   unreachable.
2. React Aria's scroll lock is `overflow: hidden` on the root element, which is
   the exact mechanism the old file's header says it had measured to clamp the
   page to the top. A card opened from scroll offset 1200 now stays at 1200, open
   and closed. Measured, not assumed.
3. Untitled UI's scrim (`bg-overlay/70` over a 6px blur) replaced this product's
   frosted one and moved 86% of the pixels in the viewport. Ours was restored;
   with it back, the add-card dialog is within 0.1% of its pre-swap screenshot.

**One bug shipped into that swap and was fixed before it went anywhere.** The
close state machine cleared its own `closing` flag when the exit finished, which
is invisible for the five callers that close themselves with a `setState` in the
same React batch, and wrong for the sixth: `CardModal` holds `open` at a literal
`true` and navigates in `onClose`, so clearing the flag re-opened the card for a
beat before the route went. Nothing caught it — not the 24 tests, not the
mutations, not the screenshots. It was found by reading the three lines back.
Worth recording because it is the honest counterweight to everything above: the
tests were written first and they were good, and the defect they missed was in
the code the swap itself introduced.

**Cost:** 404 lines to 236 including a 55-line header, the `motion` dependency
and `src/lib/core/motion.ts` deleted for want of a consumer, and 10 tests over
two pure predicates replaced by 24 that render the component.

---

## 5. Unmanaged surface: 27 raw `<button>`s

14 files under `src/features` and `src/app` contain 27 raw `<button>` elements.
Eight of those files also import a Button component or `untitledButtonClasses`;
six do not.

**This is not an accessibility defect.** Every one sampled is
`<button type="button">`, which gives keyboard activation, focus and the right
role for free. They are interactive *rows* — facet rows, sidebar entries, Pokédex
cells — styled `bg-transparent border-none`. They are not buttons as an
affordance, and a React Aria `Button` would not obviously improve them.

**It is a consistency surface**, and it now has a recorded verdict:
`CONVENTIONS.md` R-STYLE-014 gained a sentence saying a transparent interactive
row is the exception the rule allows. The 27 stop reading as drift, and the next
reviewer is not re-deciding it.

---

## 6. The plan

### Quick wins — negligible risk

1. **`components.json`** — done. It did not exist, so `npx untitledui upgrade`
   had no baseline to diff against. It now records `version: 8` and the four
   aliases, and it was verified the hard way: a real `npm run ui:add` ran against
   it and put its files where they belong.
2. **R-STYLE-014's exception** — done, one sentence.
3. **Delete `application/modals/stacked-left-aligned-modal.tsx`** — done. It came
   in with the modal bundle, which was vendored for the shell inside it, and
   nothing imports it. R-UI-007: a vendored component with no consumer is not
   known to work.

### Main body

4. **Rewrite the three callers' className contract into real props.** The one
   piece of the modal work deliberately left undone. `cardModalClasses.ts` and
   `Sheet.tsx` style Modal's internals with `[&_.modal-scroll]:` descendant
   variants, because Modal owns those elements and takes no className for them.
   Keeping the hooks made the swap one change instead of three; removing them is
   a clean follow-up. Risks: purely visual, three files, and
   `Modal.dom.test.tsx` already fails if a hook disappears.
5. **`Sheet` against `application/slideout-menus`.** I ruled it out on shape, not
   on a trial. Worth thirty minutes to confirm, and no more than that.

### Later or never

6. **The 27 raw rows** — leave. Documented as an exception rather than migrated.
7. **`Button`, `Card`, `Segmented`, `MenuPopover`, `ViewerPill`, `ThemeToggle`,
   `MarketingViewerSlot`** — leave. All are the thin wrapper R-UI-002 asks for,
   each with its override argued in its own header. `Segmented`'s WCAG
   measurement is the model the others should be held to.
8. **The 10 ⚪ components** — leave. No equivalent, checked against the catalogue.

---

## 7. How this is held

**Already in place:**

- R-UI-001 to R-UI-008 in `CONVENTIONS.md`, with stable IDs.
- The `## Components` block in `CLAUDE.md` — search first, wrap don't reimplement,
  never hand-edit the vendored trees, and say in one sentence what you searched
  for if you build your own anyway.
- `npm run ui:add` (R-UI-005) wrapping the generator and reporting what it
  repaired. It reported six repairs during this session, including restoring
  `src/utils/cx.ts` after the generator overwrote it with the stock version —
  which is the failure it exists to catch, observed happening.
- `tsconfig.vendored.json` keeping `strict` on vendored code while dropping the
  four flags the library is not written under.
- `components.json`, as of this session.

**The gaps, in order:**

1. **Two rules are labelled below what they are.** R-API-002 (the public
   allow-list) reads `Reviewed` and is genuinely enforced by
   `cards-public.test.ts` — leaking a column turns three tests red. A rule that
   under-claims its enforcement is a smaller problem than one that over-claims,
   but it is the same class of error, and this project has been bitten by the
   other direction more than once.
2. **Nothing checks R-UI-004** — "say in one sentence what you searched for". It
   is the rule that makes building-outside-the-library visible, and it is honoured
   consistently in this codebase's headers, entirely by discipline. Leave it
   `Reviewed`; a lint rule for it would be theatre.
3. **`display: contents` is a trap this codebase set twice.** The modal hit it
   during this work and it was caught in a browser. `CardItem.tsx` had been
   sitting on it since it was written, and every card in the collection was
   unreachable by keyboard as a result. Both used it for the same reason — to
   stop a wrapper drawing its own focus ring — and `outline-hidden` is the
   answer in both places. Nothing checks for it; `visual/owner.spec.ts` now
   asserts no card is box-less, which covers the grid and nothing else.
4. **The screenshot suite has no baselines under version control.**
   `.gitignore:15` excludes `visual/**/*-snapshots/`, so on a fresh checkout every
   screenshot test fails with "a snapshot doesn't exist", and after one
   `--update-snapshots` it can only catch changes made after that moment on that
   machine. It could not answer "did this change the way anything looks" without
   stashing the work, generating baselines from the old tree, and un-stashing —
   which is what was done here, and is not a thing anyone will do twice. This is
   the most valuable check in the repository and it is switched off by default.
5. **`Sheet` has no equivalent and no owner.** It is 93 lines of ours composing
   Modal, and the one component here that a library update could quietly break.
