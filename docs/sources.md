# Sources

Every outside source Card Orb (this API and `bartdunweg/cardorb-web`) reads, what for and when.
Checked against both repositories' `main` on 2026-09-14. Update it in the same change as a
source you add, drop or move.

"Live" means a user's request can wait on it; "cached" gives how long; "cron" and "script" never
reach a user. The crons are in `vercel.json`: catalogue 03:30 UTC, snapshot 04:00, health 06:00,
TCGplayer prices 21:15, warm every 10 minutes.

Scrydex is used with Bart's permission. It began on 2026-09-14 with pictures, Japanese set logos
and the reverse-holo evidence; on 2026-09-17 he extended it to every kind of card and set fact, as
one source beside TCGdex, TCGplayer and Bulbapedia rather than in place of them.

## Card pictures

| Source                                      | Address                                               | Used for                                                                                | When                                                                        |
| ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Our bucket (Cloudflare R2 `cardorb-images`) | https://images.cardorb.com                            | Every picture a client is sent: card scans, set logos and symbols (null where none)     | The browser loads it, through Vercel's image optimizer; edge cached         |
| Worker `cardorb-images-writer`              | https://cardorb-images-writer.bart-dunweg.workers.dev | Writing into the bucket (`IMAGES_WRITE_SECRET`)                                         | Catalogue cron and `scripts/copy-images-to-bucket.mjs` only                 |
| TCGdex assets                               | https://assets.tcgdex.net                             | Card scans (`low.webp`, `high.webp`), set logos and symbols                             | Catalogue cron only; copied into the bucket                                 |
| Limitless                                   | https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com  | A scan TCGdex lacks, by set code; Japanese scans                                        | Catalogue cron only                                                         |
| TCGplayer CDN                               | https://tcgplayer-cdn.tcgplayer.com                   | A scan by the card's TCGplayer product (`tcgplayer-ids.generated.json`)                 | Catalogue cron only                                                         |
| pokemontcg.io images                        | https://images.pokemontcg.io                          | A scan by set name; logos for 57 sets TCGdex has none for                               | Catalogue cron only                                                         |
| Scrydex images                              | https://images.scrydex.com                            | A scan for seven trainer kits no other source pictures (`SCRYDEX_SETS` in `artwork.ts`) | Catalogue cron only                                                         |
| Scrydex Japanese set logos                  | https://scrydex.com/pokemon/jp/expansions             | Every Japanese set's wordmark, with Scrydex's permission (2026-09-14; `scrydex-japan-logos.ts`) | Japanese catalogue cron only                                                |
| Scrydex Japanese scans | https://images.scrydex.com | A Japanese card's scan where TCGdex, Limitless and TCGplayer have none, matched by `scrydexNumbers` (2026-09-14, with permission) | Japanese catalogue cron only |
| PokeAPI (GitHub raw)                        | https://raw.githubusercontent.com/PokeAPI             | Pokédex artwork, 1,025 files in `public/artwork/pokedex`                                | Script `pokedex-art.mjs` only                                               |

### The order a picture is looked for

For an English card, in the catalogue cron (`mirror.ts`, `image-store.ts`):

1. **Our bucket.** The copy already holds our address: nothing is asked.
2. **TCGdex**, the scan its record names. When that answers 404, straight to TCGplayer (4).
3. **Limitless**, by the set's printed code, never for a lettered number, and never for a code another English set prints too (30th Celebration and its Classic Collection are both 30C).
4. **TCGplayer**, by the card's product.
5. **pokemontcg.io**, by set name.
6. **Scrydex**, for the sets read by hand; its stand-in picture is refused by its ETag.
7. **Nothing found**: `catalogue_cards.image` stays null and the card draws its back.

Whatever is found is copied into the bucket once and never fetched again. A blank card is asked
again only on `?full=1`, or when the other catalogues already answered for its set. On
2026-09-14, eight cards were nowhere: My First Battle 33 Potion and 34 Switch (TCGplayer has the
product, no photo), Pikachu at the Museum (a jumbo card) and the five Poké Card Creator Pack cards.

## Prices

| Source                    | Address                        | Used for                                                                                   | When                                                                                                                             |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| tcgcsv (TCGplayer's feed) | https://tcgcsv.com/tcgplayer   | Every price, in USD: English (category 3) and Japanese (85); the daily archive for history | Cron 21:15 writes `tcgplayer_prices` and `card_price_months`; Browse, search and Japanese prices read a group live, 1 day cached |
| Frankfurter (ECB rates)   | https://api.frankfurter.dev/v1 | USD to EUR for every price                                                                 | 1 day cached; no rate, no price                                                                                                  |
| TCGdex REST               | https://api.tcgdex.net/v2      | TCGplayer's figure relayed on a card's record, for a card with no TCGplayer link           | Fallback only, 1 day cached                                                                                                      |
| Cardmarket                | none                           | Dropped on 2026-09-12                                                                      |                                                                                                                                  |

## Card data

| Source               | Address                                   | Used for                                                                              | When                                                                                               |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Supabase (Postgres)  | `NEXT_PUBLIC_SUPABASE_URL`                | Collections, the English catalogue copy, prices, history, snapshots, auth, avatars    | Every request; rows 1 h, facts 1 day cached                                                        |
| TCGdex REST          | https://api.tcgdex.net/v2                 | Sets, cards, numbers, variants, languages; the Japanese and other language catalogues | Catalogue cron. Live: card sheet, adding a card (default finish), the Japanese shelf; 1 day cached |
| TCGdex GraphQL       | https://api.tcgdex.net/v2/graphql         | English set index (era, date, counts, logo), rarities and types                       | Live: 24 h in memory per instance                                                                  |
| pokemontcg.io API    | https://api.pokemontcg.io/v2              | Set and card lists behind the picture fallback and set logos                          | Cron and cached builds, 1 day; refuses most calls since 2026-09                                    |
| Bulbapedia           | https://bulbapedia.bulbagarden.net        | Which languages each pre-Black & White set was printed in                             | Script `set-languages.mjs`, writes `set-languages.generated.json`                                  |
| Bulbapedia           | https://bulbapedia.bulbagarden.net        | Which cards of a set have a reverse holo (the general rule and each set page's own), a tie-breaker | Script `reverse-holo-evidence.mjs`, rules read by hand 2026-09-14, writes `reverse-holo.generated.json` |
| Scrydex expansions   | https://scrydex.com/pokemon/expansions    | Which variants of each English card exist (its reverse holo), one witness of three; never its prices | Script `reverse-holo-evidence.mjs` (with permission, 2026-09-14), one page a second, cached |
| Scrydex expansions and card pages | https://scrydex.com/pokemon/expansions, /pokemon/cards/card/{code}-{n} | A set's code, name and release date beside TCGplayer's (`set-facts-rules.mjs`, data-health); how each set pads its printed numbers | Script `number-padding.mjs` in the weekly job, and data-health (with permission, extended 2026-09-17) |
| PokeAPI (GitHub raw) | https://raw.githubusercontent.com/PokeAPI | Species names                                                                         | Script `pokedex.mjs`, writes `pokedex.generated.json`                                              |

## What a page waits on

- **Collection, public profile**: Supabase only when warm. Cold: the copy, Frankfurter, and
  TCGdex, pokemontcg.io or Limitless only for a set the copy lacks.
- **Browse shelf**: TCGdex GraphQL and the pokemontcg.io logo HEADs, both 24 h in memory, so the
  first visitor after a deploy or on a cold instance pays them.
- **Browse set page**: the copy; tcgcsv group and Frankfurter, 1 day. Japanese: TCGdex REST and
  Limitless, live with 1 day cached.
- **Card sheet**: the copy; TCGdex REST card for a card the copy lacks, 1 day; Frankfurter.
- **Search**: the copy, then tcgcsv and Frankfurter for prices; TCGdex only when the copy cannot
  answer.

Every catalogue fetch has an 8 s timeout (`CATALOGUE_TIMEOUT_MS`, `util.ts`); TCGdex's client
retries three times and trips a breaker when refused (`tcgdex-client.ts`).
