# Untitled UI adoption — where we stand, and what to do next

Investigation only. Nothing was changed. Every claim carries a `file:line` or a
command output.

**One caveat you should apply to everything below.** The prompt for this asks
for a fresh session, precisely so the agent is not defending its own work. This
was run in the session that did the migration. Read the ⚪ column with that in
mind — it is the category where self-deception lives, and I wrote most of the
code being judged.

---

## 1. Adoption today, in numbers

| | |
|---|---|
| Untitled UI families installed | **12 base · 8 application · 3 foundations · 2 shared-assets** |
| Access | **PRO** (`has_pro_access: true` from the catalogue) |
| Import sites reaching into Untitled UI from our code | **60** |
| Our own UI files | **64** (`components/shared/` 19 · `features/*` 30 · `_components/` 15) |
| Of those, with a genuine Untitled UI equivalent | **2** |
| Competing UI libraries | **0** — no Radix, MUI, Headless, Chakra, react-select, react-modal, react-toastify |
| Our own implementations of the notoriously hard parts | **1** (`Modal.tsx`) |

**Conclusion in one line: adoption is high and the remaining gap is small, but
it is concentrated in exactly the place where it costs the most — one
hand-written modal that every overlay in the app is built on.**

## 2. The overlap matrix

Sorted by how often each is used. Only our own components; vendored files are
not judged against themselves.

| Component | Uses | Lines | Class | Untitled UI equivalent | Action |
|---|---:|---:|---|---|---|
| `Card` | 126 | 74 | ⚪ | none — a surface recipe, not a component | Keep. It is 74 lines of tokens; there is no `card` in the catalogue |
| `Button` | 55 | 184 | 🟡 | `base/buttons/button` | Keep the wrapper. It bridges React Aria's `Link` to Next's, adds an sr-only external-link announcement, and a `<span>` mode for buttons nested in link cards — a real gap, documented at `Button.tsx:14` |
| `CardsView` | 21 | 1761 | ⚪ | none | Keep. Domain logic, not UI |
| `SigninShell` | 14 | 94 | ⚪ | none | Keep. Page layout for the four door screens |
| `CardDetail` | 13 | 227 | ⚪ | none | Keep. Domain |
| `Sheet` | 11 | 95 | 🔵 | `application/slideout-menus/*` are **composed panels**, not a shell | Rebuild on the same primitive `Modal` moves to — see below |
| `FormField` | 11 | 58 | 🟡 | `base/input/label` + `base/input/hint-text` | Replace its internals with those two. They are installed and unused |
| **`Modal`** | **10** | **405** | 🔵 | **no generic modal in `base/`.** The 36 in `application/modals/` are composed dialogs (`image-crop-modal`, `plan-01-modal`) | **The one that matters. See section 4.** |
| `SettingsPanel` | 8 | 172 | ⚪ | none | Keep. Layout |
| `CardsSidebar` `FilterSheet` `ViewSheet` `CardsTabBar` `FilterMenu` `ViewMenu` | 6–7 each | 46–520 | ⚪ | `application/app-navigation` exists but is **built for a different shape** | Keep. See the ⚪ list |
| `CardAddDialog` | 6 | 797 | ⚪ | none | Keep. Domain, and it already uses `ComboBox`, `Input`, `Checkbox`, `Button` |
| `ThemeProvider` | 5 | 191 | ⚪ | none | Keep |
| `Wordmark` | 5 | 138 | ⚪ | none | Keep — it is the brand mark |
| `Segmented` | 5 | 109 | 🟡 | `base/button-group/button-group` | Already a wrapper over it. Keep |
| `LegalPage` `MarketingFooter` `Navbar` | 5–7 | 58–100 | ⚪ | none | Keep. Page furniture |
| `MenuPopover` | 2 | 89 | 🟡 | `base/dropdown/dropdown` | Already a wrapper. Keep |
| `ViewerPill` | 1 | 46 | 🟢 | `base/badges/badges` | **Replace.** Every other chip in the app already uses `Badge` |
| `RouteError` | 2 | 95 | 🟡 | `application/empty-state/empty-state` | Consider. It is installed and used elsewhere |

**🟢 1 · 🟡 5 · 🔵 2 · ⚪ the rest.**

The honest reading: this is not a codebase that reinvented the library. It is a
codebase that adopted the library and kept the things the library does not have.

## 3. Legacy signals

| Check | Result |
|---|---|
| `rg "@radix-ui\|@mui\|@headlessui\|react-select\|react-modal\|react-toastify\|@chakra" package.json` | **0 hits** |
| Clickable `<div>` / `<span>` | **1** — `Modal.tsx:361`, the backdrop, with Escape handling beside it |
| `createPortal` / focus-trap / `useOnClickOutside` | **1 file** — `Modal.tsx` |
| Our overlays that use React Aria | `MenuPopover` only. `Modal`, `Sheet` and `Segmented` do not import it |

That last row is the finding. `Modal.tsx` hand-writes a portal, a scroll lock
and a focus trap in 405 lines, and everything overlay-shaped in the app sits on
it: `Sheet`, `FilterSheet`, `ViewSheet`, `CardModal`, `CardAddDialog`,
`PublicCardDialog`.

## 4. `Modal` — the one decision worth making

**Untitled UI does not solve this.** There is no modal primitive in `base/`, and
its 36 `application/modals/*` are finished dialogs for specific jobs. Adopting
one would mean adopting its content, not its shell.

**What does solve it is one layer down.** Untitled UI's own overlays are built
on `react-aria-components`, which this project already depends on and which
ships `ModalOverlay`, `Modal` and `Dialog` — a portal, a focus trap, a scroll
lock (`usePreventScroll`, which handles iOS specifically) and the ARIA wiring,
maintained by Adobe.

So the honest classification is 🔵: rebuild `Modal.tsx` as a composition over
`react-aria-components`, not adopt an Untitled UI component.

**And it is the highest-risk change in this document.** `Modal.tsx`'s comments
document real behaviour that was got wrong before — the scroll lock at
`Modal.tsx:62-98` compensates for the scrollbar width so the page does not shift,
and there is a hand-written `isVisible` filter on the focusable list. Whether
React Aria covers each of those has to be proved per case, in a browser, not
assumed from its README.

**Recommendation: do it, but as its own piece of work with its own verification,
and not because "use the library more" says so.** The argument is keyboard and
screen-reader behaviour we would otherwise maintain ourselves — not consistency.

## 5. Quick wins — today, negligible risk

| # | Change | Why it is safe |
|---|---|---|
| 1 | `ViewerPill` → `base/badges/badges` | 1 call site, and every other chip in the app is already a `Badge` |
| 2 | `FormField` internals → `base/input/label` + `base/input/hint-text` | Both installed and currently unused. Its own API does not change, so its 11 call sites do not move |
| 3 | Delete `application/app-navigation/**` (6 files) or adopt it | It is installed, unused, and drags `react-aria` and `react-hotkeys-hook` — two dependencies that exist only for dead files |

## 6. The plan, in order

**Now:** the three quick wins. One PR each, the old version deleted in the same
PR.

**Next:** `RouteError` → `EmptyState`. It is 🟡, one screen, and `EmptyState` is
already used in six places.

**Its own piece of work:** `Modal` on `react-aria-components`, then `Sheet`
follows for free. Risks to prove, not assume:

- **State** — ours is controlled through an `open` prop; React Aria's `Modal`
  wants `isOpen` + `onOpenChange`. Ten call sites.
- **Focus and portals** — the reason to do it, and the reason it can regress.
  Compare tab order and the return-focus target on every overlay.
- **Scroll lock** — ours compensates for scrollbar width. Verify React Aria's
  does the same, or the page shifts on open.
- **Visual** — our backdrop is `motion`-animated; React Aria gives entry/exit
  data attributes instead.
- **Tests** — the four overlay screens are reached through `owner.spec.ts`.

**Later or never:** everything ⚪. Not because it could not be rewritten, but
because there is nothing to rewrite it into.

## 7. The ⚪ list — what stays ours, and why

| Component | Why there is no equivalent |
|---|---|
| `Card` | 74 lines of our tokens. The catalogue has no `card`; it has `metrics` and `table`, which are different things |
| `CardsView`, `CardItem`, `CardDetail`, `CardAddDialog`, `CardsPokedex`, `Filter*`, `View*` | Domain. They render a Pokémon collection; no component library has an opinion on that |
| `CardsSidebar`, `CardsTabBar`, `AppShell`, `AppSidebar`, `AppTabBar` | `application/app-navigation` exists, and is built for a fixed sidebar with nav items and an account card. Ours is a two-pane rail that swaps with the main pane, plus a bottom bar whose slots are `fr` columns. That is not a variant of theirs |
| `SigninShell`, `LegalPage`, `MarketingFooter`, `Navbar`, `SettingsPanel` | Page furniture. Layout for this product's pages |
| `ThemeProvider` | Reads `data-theme` set by a blocking pre-paint script. Untitled UI has no theme provider |
| `Wordmark` | The brand mark |
| `TiltScan`, `poke-holo.css` | The product identity (R-STYLE-007). Protected by rule |

**Where I would look first if I were checking this list**, given the caveat at
the top: `SettingsPanel` and `SigninShell`. Both are "layout" in the sense that
anything can be called layout, and both are the sort of thing a library
eventually grows.

## 8. Keeping it that way

Already done while this was written, in `98bd8ef`:

- **`CONVENTIONS.md` R-UI-001 … R-UI-008** — search before building; use it if it
  exists; a thin wrapper if our need differs; never edit vendored trees by hand;
  and say in one sentence what you searched for if you build your own anyway.
- **The same block in `CLAUDE.md`**, so it is in the read path rather than in a
  document somebody has to open.

R-UI-004 is the one that does the work: it makes building outside the library
*visible at the time*, instead of something an audit finds later.

**What is not enforced, and could be.** Every R-UI rule is *Reviewed*. Two are
mechanisable:

- R-UI-003 (never edit vendored by hand) — a CI check that
  `src/components/base|application|foundations` has no diff outside a
  `npm run ui:add` commit.
- R-UI-005 (`ui:add`, not the bare CLI) — already half-enforced, in that the
  wrapper is the only path that repairs the six things the generator breaks. A
  check that `src/src/` does not exist would catch the bare CLI being used.
