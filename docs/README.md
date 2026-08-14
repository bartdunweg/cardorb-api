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
- Root `README.md` — what Card Orb is, the API surface, production environment.
