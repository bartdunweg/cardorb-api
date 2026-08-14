# Docs map

This directory is Card Orb's memory: decisions, feedback, and the changelog. See the
root `CLAUDE.md` for how and when to write to it.

- `decisions/` — decision records, one per non-obvious choice. Immutable; superseded,
  never rewritten. Numbered `NNNN-slug.md`.
- `feedback/` — feedback records, quoted verbatim before interpretation. Numbered
  `NNNN-slug.md`.
- `CHANGELOG.md` — generated from fragments in `changelog.d/`. Never hand-edited.
- `changelog.d/` — one fragment per user-visible change, so parallel worktrees don't
  conflict on a single changelog file.

## Starting points

- `decisions/0000-adopt-memory-system.md` — why this repo has this structure.
- `decisions/0001-premium-personal-collection-landing.md`,
  `decisions/0002-subtle-free-european-positioning.md` — the landing-page rebuild.
- `decisions/0003-split-lib-core-cards.md`, `decisions/0004-split-lib-core-catalogue.md`,
  `decisions/0005-split-cardsview.md` — the `lib/core`/`CardsView` refactor.
- `decisions/0006-generated-username-at-signup.md` — why signup generates a username
  instead of asking for one.
- `decisions/0007-shared-form-components-over-css-classes.md`,
  `decisions/0009-settings-modal-tailwind-notes.md` through
  `decisions/0013-tailwind-entry-point-scope.md` — the Tailwind CSS migration.
  `decisions/0012-cascade-layers-fix.md` is **worth reading first**: a cascade-layers
  bug meant every margin/padding Tailwind class added since the migration started was
  silently losing to legacy CSS; screenshots looked fine because `gap` was unaffected.
- `decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md` — per-variant
  inventory fields, and the bearer-token/row-level-security bug the iOS client's
  extension work uncovered.
- `decisions/0014-cache-assembled-collection.md` — why the assembled collection is
  cached across requests, not just its rows and catalogue inputs, and the Vercel
  Fluid CPU cost that surfaced it.
- Root `README.md` — what Card Orb is, the API surface, production environment.
