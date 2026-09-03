---
paths:
  - "src/lib/core/**"
  - "src/lib/storage/**"
  - "supabase/**"
---

# Cards, catalogues and the collection

- **The catalogues say what a card *is*; the collection says that you *own* it.** Never the
  other way round. The rows are hand-kept and some are wrong, so the collection cannot be
  trusted about facts the catalogue already holds.
- **Rarity, type and era come from the catalogue and are read-only** for every client. An
  editable copy of a catalogue fact is a second source that drifts from the first.
- **Nothing writes a collection row the catalogue has not matched.** An unmatched row has no
  card behind it, so every fact shown about it is a guess.
- **A copy records which printing it is. `null` is "nobody has said", not `normal`.**
  Defaulting the unknown to `normal` turns a missing answer into a wrong one.
- **TCGdex's vocabulary, without exceptions**, including the card-type suffix and the coarser
  rarity tiers. Both exceptions once carved out were "the stored value looks better", which is
  how a second vocabulary starts.
- **Collection value is per user and counts copies held.** Prices come from the shared
  catalogue, so only the ownership side can make the figure yours.
- **`lib/core/` is `catalogue/`, `collection/` and `account/`.** Only what both domains need
  (config, env, util) stays at its root. Thirty files on one heap gave no hint which of them a
  change could reach.
- **Prices come from Cardmarket's daily guide at build time**, cached as a small map. TCGdex
  is asked only for a card the guide does not know.
- **Migrations are applied and recorded through `supabase db query --linked` and
  `supabase migration repair`**, which need the CLI login and not the database password.
- **`cards.collection_id` is `on delete set null` on the live database**, so `deleteFolder()`
  emptying a folder first is belt and braces. The migration file declares the reference
  without it; harmless, already applied.
