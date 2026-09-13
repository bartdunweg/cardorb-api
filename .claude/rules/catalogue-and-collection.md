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
- **Every read or write of one person's rows names their `userId` in the query itself, and a
  write checks that a row changed.** Row level security is the wall against seeing what is
  private; it is not the application saying whose rows it wants. The `cards` policy lets a
  public profile's rows through to any signed-in reader, so a query without `userId` handed a
  brand new account the public collection as its own, and an unscoped write no-ops silently.
  This was the web app's R-SEC-002 until it stopped querying the database (its R-DATA-003);
  the query runs here now, so the rule lives here.
- **`lib/core/` is `catalogue/`, `collection/` and `account/`.** Only what both domains need
  (config, env, util) stays at its root. Thirty files on one heap gave no hint which of them a
  change could reach.
- **A card's price is TCGplayer's, in euros** (since 2026-09-12): TCGdex's relay of it, off the
  card's own record, a set's cards at a time for a day, and tcgcsv for the weekly point of every
  card nobody holds; dollars at the ECB's daily rate. pokemontcg.io answered one set in eight by
  2026-09-11 and is asked for no price any more. Where TCGplayer says nothing the card has no
  price, and no other market stands in. A Japanese card the same (since 2026-09-13): TCGdex relays
  no TCGplayer figure for one, so its price is TCGplayer's Japanese shelf on tcgcsv, through
  `tcgplayer-ids.ja.generated.json` (`shelfUsdFor` in `collection/collection.ts`), and TCGdex's
  Cardmarket figures on its record are not read. A card TCGplayer does not price is nearly always a card
  with no product in `tcgplayer-ids.generated.json`: `scripts/tcgplayer-links.mjs` links those
  from tcgcsv, weekly, in `.github/workflows/tcgplayer-links.yml`. The algorithm that turns the
  figures into the one shown is `lib/core/price-basis.mjs`, and nothing else.
- **A migration is applied by `.github/workflows/migrate.yml`, never by hand.** A merge to
  main that adds a file under `supabase/migrations/` waits for the Vercel Production deploy
  of that commit, then runs `supabase db push`, which applies the file and records it in one
  step. Running one by hand (`db query --file`, then `migration repair`) is how ten files
  ran without a record and three records got versions no file carries (fixed 2026-09-12).
  Two files may not share a version: the history table keys on it, so the second of a pair
  is never recorded. Give a new file a timestamp nothing else has.
- **`cards.collection_id` is `on delete set null` on the live database**, so `deleteFolder()`
  emptying a folder first is belt and braces. The migration file declares the reference
  without it; harmless, already applied.
