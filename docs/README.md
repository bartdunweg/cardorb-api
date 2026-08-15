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
  `decisions/0013-tailwind-entry-point-scope.md` — the Tailwind CSS migration's
  first phase (forms, settings, modal, tab bar, base components, the entry-point
  fix). `decisions/0012-cascade-layers-fix.md` is **worth reading first**: a
  cascade-layers bug meant every margin/padding Tailwind class added since the
  migration started was silently losing to legacy CSS; screenshots looked fine
  because `gap` was unaffected.
- `decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md` — per-variant
  inventory fields, and the bearer-token/row-level-security bug the iOS client's
  extension work uncovered.
- `decisions/0014-cache-assembled-collection.md` — why the assembled collection is
  cached across requests, not just its rows and catalogue inputs, and the Vercel
  Fluid CPU cost that surfaced it.
- `decisions/0014-public-latest-pull-endpoint.md` — the public "latest pull"
  endpoint for the portfolio site, and `decisions/0021-latest-pull-owned-only.md`
  — why it has no API key (a key in a public site's JavaScript is not a secret)
  and why it was answering with a wishlist card.
- `decisions/0022-gallery-artwork-via-pokemontcg.md` — **worth reading before
  trusting a card number.** Trainer Gallery scans now come from pokemontcg.io,
  but the audit behind it found that 23 gallery rows in the collection are filed
  under a number belonging to a different card. The lookup is name-checked for
  exactly that reason. `trainer-gallery-row-corrections.md` beside this file is
  the worklist, and should be deleted once those rows are fixed.
- `decisions/0017-cards-rail-pane-swap-fix.md` through
  `decisions/0020-card-add-input-styling-regression.md` — the Tailwind
  migration's second phase, finishing `cards.css` and `landing.css`.
  `0017` is a follow-up bug from `0012`: an unconditional Tailwind property beat
  a still-CSS conditional reset (rail/main pane toggle) — the rule to avoid it
  for the rest of the migration. `0018` is the same failure mode found again:
  a class can have consumers beyond the "obvious primary" file (loading
  skeletons, duplicate render branches). `0020` is a genuine regression found
  in a later audit: CardAddDialog's inputs had silently lost their
  glass-control styling because the class they read had gone dead — a caution
  about verification blind spots on routes that need a signed-in session.
- `decisions/0021-remove-notion-integration.md` — why the Notion integration
  was deleted outright, now that Postgres is confirmed as the real store,
  rather than kept as a dormant fallback.
- Root `README.md` — what Card Orb is, the API surface, production environment.
