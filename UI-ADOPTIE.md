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
| Of those, with a genuine Untitled UI equivalent | **3** |
| Competing UI libraries | **0** — no Radix, MUI, Headless, Chakra, react-select, react-modal, react-toastify |
| Our own implementations of the notoriously hard parts | **1** (`Modal.tsx`, 404 lines — and there is a 47-line shell for it) |

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
| `Sheet` | 11 | 95 | 🟡 | none directly; `slideout-menus/*` are composed panels | Follows `Modal`. The drawer direction is the wrapper's job |
| `FormField` | 11 | 58 | ⚪ | none — **it contains no FormField.** `FormNote`, `FormError` and a `<form>` layout wrapper; the field parts were adopted earlier | Keep. Corrected — see below |
| **`Modal`** | **10** | **404** | 🟡 | **`application/modals/modal.tsx`** — a 47-line shell exporting `ModalOverlay`, `Modal`, `Dialog`, `DialogTrigger`, already styled with our tokens | **The one that matters. See section 4.** |
| `SettingsPanel` | 8 | 172 | ⚪ | none | Keep. Layout |
| `CardsSidebar` `FilterSheet` `ViewSheet` `CardsTabBar` `FilterMenu` `ViewMenu` | 6–7 each | 46–520 | ⚪ | `application/app-navigation` exists but is **built for a different shape** | Keep. See the ⚪ list |
| `CardAddDialog` | 6 | 797 | ⚪ | none | Keep. Domain, and it already uses `ComboBox`, `Input`, `Checkbox`, `Button` |
| `ThemeProvider` | 5 | 191 | ⚪ | none | Keep |
| `Wordmark` | 5 | 138 | ⚪ | none | Keep — it is the brand mark |
| `Segmented` | 5 | 109 | 🟡 | `base/button-group/button-group` | Already a wrapper over it. Keep |
| `LegalPage` `MarketingFooter` `Navbar` | 5–7 | 58–100 | ⚪ | none | Keep. Page furniture |
| `MenuPopover` | 2 | 89 | 🟡 | `base/dropdown/dropdown` | Already a wrapper. Keep |
| `ViewerPill` | 1 | 46 | ⚪ | none — **`Badge` cannot be a link.** No `href`, no `<a>`, no `Link` in `badges.tsx`; `AvatarLabelGroup` is a two-line `<figure>` | Keep. Corrected — see below |
| `RouteError` | 2 | 95 | 🟡 | `application/empty-state/empty-state` | Consider. It is installed and used elsewhere |

**🟢 0 · 🟡 5 · 🔵 0 · ⚪ the rest.** (Was 🟢 1 · 🟡 7 before the two below were read rather than listed.)

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

**Correction, and it matters.** An earlier draft of this document said Untitled
UI ships no modal and that the answer was to rebuild on `react-aria-components`
ourselves. That was wrong, and Bart pushed back on it. It came from reading the
catalogue listing — 36 entries under `application/modals/`, all composed dialogs
— and never installing one to look inside.

**Installing one shows a shared shell comes with it.**
`application/modals/modal.tsx`, 47 lines, exporting `ModalOverlay`, `Modal`,
`Dialog` and `DialogTrigger`. It is a thin styled wrapper over
`react-aria-components` — which is exactly the composition the earlier draft
proposed building by hand, except already carrying our tokens (`bg-overlay/70`,
`bg-primary`, `rounded-xl`, `shadow-xl`), the backdrop blur, and entry/exit
animation through `animate-in` / `animate-out`.

Verified by running `npx untitledui@latest add access-request-modal` in a
throwaway project: 16 files, and `modals/modal.tsx` is one of them.

**So this is 🟡, not 🔵: adopt the shell, wrap what it does not cover.**

Our `Modal.tsx` is 404 lines against its 47. What the difference buys:

| Ours does | The shell does | Verdict |
|---|---|---|
| Portal, focus trap, Escape, backdrop click | React Aria, underneath | **Theirs.** Adobe maintains it; we have 405 lines of it |
| Scroll lock **with scrollbar-width compensation** (`Modal.tsx:62-98`) so the page does not shift | Unknown | **Could not verify** — see below |
| A drawer that comes from the right on desktop and up from the bottom on a phone (`Modal.tsx:120`, `:156`) | Not offered | **Ours.** This is what the wrapper is for |
| `motion`-driven animation | `animate-in`/`animate-out` data attributes | Theirs, unless the spring is wanted |

**What I could not verify.** Whether React Aria's scroll lock compensates for the
scrollbar's width. I could not find the implementation in the installed package —
greps for `paddingRight`, `scrollbarWidth` and `clientWidth` across
`react-aria-components/dist` came back empty, which more likely means my search
was wrong than that the code is absent. **Test it in a browser before trusting
either answer**: open an overlay on a page long enough to scroll and watch
whether the content jumps sideways. That single behaviour is why our version is
405 lines instead of 100.

**Recommendation: adopt the shell, keep a thin wrapper for the drawer direction,
and prove the scroll behaviour in a browser rather than from a README.** The
argument is still keyboard and screen-reader behaviour we would otherwise
maintain — but the work is now a wrapper, not a rebuild.

## 5. Quick wins — all three turned out not to be

**Every one was classified from a filename or a catalogue entry, and every one
was wrong when the file was opened.** Recorded rather than quietly dropped,
because the pattern is the finding.

| # | Claimed | What reading it showed |
|---|---|---|
| 1 | `ViewerPill` → `Badge` | **`Badge` cannot be a link.** `badges.tsx` has no `href`, no `<a>`, no `Link`. `ViewerPill` is a `<Link>` with an `Avatar`, a width cap and an aria-label. `AvatarLabelGroup` is a two-line `<figure>`, also not a link. ⚪, not 🟢 |
| 2 | `FormField` internals → `label` + `hint-text` | **`FormField.tsx` contains no `FormField`.** Its own docstring says `FormField`, `FormLabel`, `FormInput` and `FormHint` were removed earlier because Untitled UI's `Input` takes label and hint as props. What is left is `FormNote`, `FormError` and a `<form>` layout wrapper — which `Label` and `HintText` do not replace. The adoption already happened |
| 3 | Delete or adopt `app-navigation` | **Correct**, and done — see the vendored-cleanup commit. 34 files and two dependencies |

One of three. The two that failed did so the same way as the recharts claim in
`AUDIT.md` and the "Untitled UI has no modal" claim in section 4 of this
document: **a conclusion drawn from a listing instead of from the thing.** That
is now four times in one week, and it is worth more as a warning than the three
changes would have been.

## 6. The plan, in order

**Now:** the three quick wins. One PR each, the old version deleted in the same
PR.

**Next:** `RouteError` → `EmptyState`. It is 🟡, one screen, and `EmptyState` is
already used in six places.

**Its own piece of work:** `Modal` on Untitled UI's own shell
(`npm run ui:add -- access-request-modal` brings it, then delete the dialog and
keep `modals/modal.tsx`), with a wrapper for the drawer direction. `Sheet`
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
