# Changelog

Generated from the fragments in `changelog.d/` by `pnpm run changelog`.
Do not hand-edit this file; add a fragment instead. `scripts/verify.sh` fails
if the two have drifted apart.

## 2026-09-16

- `GET /v1/cards` gives each copy a `printImage`: the picture of the printing it is, where that printing or its print run has its own (a Poké Ball reverse, Base Set's Unlimited print), so a list shows the card the copy is. Null where the card's scan stands for it; `image` is unchanged.

- `GET /v1/movers` and `GET /v1/public/{username}/cards` say which printing a card is and what state it is in: `finish`, `foilPattern`, `edition`, `condition` and `grade`, where every copy of the card answers the same and null where they differ. On a public wishlist they are the printing and state its owner is looking for. What a copy cost, its notes and its binder stay private.

- `GET /v1/collection/export` writes Grade, Purchase date and Favorite after Finish, and `POST /v1/import/csv` reads them back, so an export imported again keeps them. An import names the file's own line in "Line N" after a blank line or a note over two lines, and a quote in the middle of an unquoted field (`Pikachu 5" promo`) is a character instead of the start of a quoted field that swallowed the rows after it.

- `POST /v1/import/csv` writes what a copy cost: a file's "Purchase price" was read and dropped on insert, so an export imported back lost every price. A commit that fails halfway takes back the rows it already wrote and says "Nothing was added, so you can try again"; before, the first batches stayed and a second run wrote them twice. A failed fold no longer fails an import whose rows are all written. A `map` the caller sends replaces the guess instead of being laid over it, so a guessed column can be set to none. The body may be up to 6 MB, so 2 MB of text as a JSON string is no longer refused as too large.

- Prices on the public profile are the owner's to show: `PATCH /v1/profile` takes `pricesPublic`, `GET /v1/profile` and `GET /v1/public/{username}/profile` say it, and with it on `GET /v1/public/{username}/cards` carries a `price` on every card (what its copies trade at, null where they differ) and `value` and `unpriced` over the whole list. Off, the default, nothing about a price leaves the building, as before.

- Every card carries `speciesIds`, every National Pokédex number on it: two or three for a tag team ("Pikachu & Zekrom-GX" is 644 and 25), the first always equal to `speciesId`, empty for a trainer. A rule binder with a dex range takes a tag team when any Pokémon on it is in the range. `speciesId` is unchanged.

## 2026-09-15

- The Poké Ball, Master Ball and Energy Symbol reverse holos come from TCGplayer's own products, with their own prices and history. TCGplayer sells 645 of them apart from the plain card (Prismatic Evolutions, Black Bolt, White Flare, Ascended Heroes); each is priced under the card as `poke-ball-reverse-holofoil`, `master-ball-reverse-holofoil` or `energy-symbol-reverse-holofoil`, in today's price, the nightly price line and a backfilled history. A card's printings offer those finishes where TCGplayer sells them and no longer where only TCGdex names one (eight basic energies of Scarlet & Violet). A copy's `finish` can be `energy-symbol` (migration 20260915060000); the Dex export writes it as "Reverse Holo" and names every finish in a new Finish column after Edition, which the import reads first. data-health checks that every such product has its own price line and that no form offers a ball TCGplayer cannot confirm.

- A binder's value line no longer dips on a day a card has no price reading. Kanto on Home read EUR 16,200 on 2026-09-13 between 19,750 and 19,794, because 184 held promos and gallery cards had no reading that day; a binder's line now values a card at its last reading up to two weeks old, as the whole collection's line already did, and Kanto reads 19,736. The day itself is filled from tcgcsv's archive for those 184 cards, and data health reports a held card's line with a day missing between two readings.

- My First Battle's Blue Border print is a run a copy can be from, beside Unlimited, as Shadowless is for Base Set. The eight cards TCGplayer sells a Blue Border product of (Bulbasaur, Charmander, Pikachu, Squirtle and the four basic energies) offer it, and a Blue Border copy reads its own price and line (`blue-border`): Pikachu is $29.58 against $17.56 for the plain card. A copy's `edition` can be `blue-border` (migration 20260915240000); a CSV that says "Blue Border" is read as it.

- `POST /v1/cards/facts` answers what a form needs to know about up to 250 cards in one request: the printings, runs, languages, foil patterns and pattern prints `GET /v1/cards/{tcgId}` answers, with the sheet's rarity, illustrator, HP, stage and regulation mark, out of the catalogue copy alone and without prices. A client asks for a page of tiles before anybody opens one, so a card's sheet opens with its choices in place instead of filling them in half a second later. A card the copy cannot answer in full is `null`, and the single route stays the way to ask about it.
- The batch gives each printing its own picture, as `GET /v1/cards/{tcgId}` does since the print pictures: one read of `card_print_pictures` for the page, and a store that will not give them costs the pictures, not the facts.

- Unown ? from the Unseen Forces Unown Collection opens with its details and its price chart. TCGdex files it as `exu-%3F`, and the path reached the card routes decoded twice, as `exu-?`, so the sheet answered "No such card" and the chart drew no line while 31 months of its prices were stored.

- `GET /v1/cards?sort=change&from=&to=` sorts a list by what each copy's price did between two days, times the copies (biggest gain first, `order=asc` biggest loss first), and each card carries its `priceChange`. For sorting the collection by price movement over any window.

- The owner's collection rows point at their catalogue cards (migration 20260915090000). 1,368 rows carried a pokemontcg.io id from before TCGdex (sv3pt5-162 for sv03.5-162), so the CSV import could not match them by id; each now carries the TCGdex id of the one card its set, number and name resolve to, which is the card every page already showed. 86 rows filed under an old set name take the official one (SVP Black Star Promos, Scarlet & Violet, Wizards Black Star Promos, Pokémon GO, BREAKpoint), and 14 tag team GX and V promos recorded as normal are holo, the only printing TCGdex and TCGplayer know of them. data-health now fails where an owner's row has no catalogue id, sits on an id its catalogue does not have (a stale or deleted id, or the other language's), or is a copy in a finish neither TCGdex nor TCGplayer names for its card; the other accounts are counted beside it.

- The morning data check fails where one TCGplayer product prices two cards, where two sets with cards share a name in one catalogue, and where a linked card carries a stray market series, and reports one-day price spikes over €10 and ids that are cards in both catalogues: each a slip the audits of 2026-09-14 found. Run against production that day it named the four Japanese links and the duplicate set pair still being fixed.

- A print run has its own picture, as a printing does. `GET /v1/cards/{tcgId}` and `POST /v1/cards/facts` answer `editionPictures`, a picture per run where one is held: Base Set's Unlimited print, TCGplayer's photo of its own Base Set product, copied by the nightly print-pictures cron. The Shadowless group's photo stays out, since it is the 1st Edition print, which the card's scan already is.

- English cards, a third pass over their facts. Crown Zenith's Galarian Gallery reads "Galarian Gallery" for all 70 cards, and Silver Tempest's Trainer Gallery grades its 17 V, VMAX and full art trainer cards Ultra Rare like the other galleries and TCGplayer. The 39 cards TCGdex gave the word "None" (My First Battle among them) carry no rarity at all. 77 trainers take their trainer type: Expedition's Dual Ball is an Item, not a Stadium; Curse Powder is a Tool; neo's Berries and Focus Band are Tools, its gyms Stadiums, Aquapolis' Cubes Technical Machines, and 24 e-Card and neo items are Items. All 78 LV.X cards evolve from the Pokémon they level up (Infernape LV.X from Infernape), and 84 Stage 1 and Stage 2 Pokémon that had no evolution have one (Team Magma's Claydol from Team Magma's Baltoy). Unown is written one way, "Unown G", where neo had "Unown [G]" and the Unseen Forces Unown Collection only "Unown"; the gold star cards read "Mewtwo ☆" where five read "Mewtwo Star" and two "Espeon ★", and the search still finds them by "star". EX and GX are written as the cards print them, "Shaymin-EX" and "Pikachu & Zekrom-GX" (852 names had a space), with "Ho-Oh" and "Nidoran♀"; a collection row written the old way keeps its card. A card opened before its set was copied goes through the same corrections. A copy of a Galarian Gallery or Trainer Gallery card in a collection takes the new grade where it held a catalogue's older word (116 copies). A Pokédex setting or binder rule that kept such a copy under the old word gains the new one beside it, so no slot or binder loses a card. The morning data check fails on a rarity word outside the one list, on "None" as a rarity, and on more English cards without an illustrator than the 740 ceiling.

- English cards say what they are in more places. 48 LV.X cards carry LV.X in their name (Diamond & Pearl's Torterra LV.X was "Torterra"), every apostrophe is a straight one so a search for "Red's Challenge" finds it, and Evolutions' secret Exeggutor lost its Japanese name. The 833 Pokémon that had no stage take TCGplayer's; 26 had the wrong one (Dragonite ex is a Stage 2, the HeartGold SoulSilver LEGEND halves are a LEGEND, Neo Genesis Elekid is a Baby). Five HP values, three evolutions, 21 rarities (the Silver Tempest and Lost Origin Trainer Gallery cards are Ultra Rare like the rest), 22 illustrators, three trainers with an energy type and nine Pokémon with a trainer type are put right. 88 more cards count as full art: Shining Fates' shiny V and VMAX, and 72 cards TCGplayer sells as full art, such as Jolteon V from Evolving Skies and Piers from Shining Fates.

- Every named reverse pattern TCGplayer sells is a finish of its own, priced from its own product: Ascended Heroes' Friend Ball, Love Ball, Quick Ball, Dusk Ball and Team Rocket reverses (`friend-ball`, `love-ball`, `quick-ball`, `dusk-ball`, `team-rocket`, migration 20260915070000), and three Black & White blister reverses TCGplayer calls "Energy Holo" as `energy-symbol`. Each is priced, lined and backfilled as `friend-ball-reverse-holofoil` and so on; the Dex export writes them as "Reverse Holo" with the finish in its Finish column. A plain reverse is offered only where TCGplayer lists a reverse holofoil for the card: 152 English cards offered one priced as the normal card, 106 of them Ascended Heroes cards whose reverses are all patterned. A reverse copy reads TCGplayer's reverse holofoil before a run's plain printing. The weekly links run keeps every linked card's printings up to what TCGplayer lists, and data-health compares the offered reverses with the night's prices.

- The cards this catalogue added from TCGplayer's own products (extra-cards.json) offer the printings that product sells, where TCGdex lists none: the league and championship prints a reverse holo only (Choice Band 121a), the alternate prints a holo (Jirachi GX 79a), a trainer kit's energies plain. Until now a form offered every finish for them. A card TCGdex lists no variants for that is not one of these still offers every finish.

- A card's sheet says which foil patterns a copy of it can really have (`patternPrints`), from TCGplayer's own products: it sells a cosmos or cracked ice print as a product beside the plain card, most of them under Miscellaneous, Prize Pack, Blister and Deck Exclusives rather than the card's set. 683 English cards have one, each print with its finish, its TCGplayer product and its price, and whether a print without a pattern exists at all. Every other linked card answers none, so a form can stop asking which pattern a holo has. The weekly links run keeps the list current.

- 2,087 English holo cards TCGdex lists as a plain printing offer the holo instead of a Standard copy, and 131 more offer the holo beside it: most Holo Rares, Ultra Rares and Secret Rares of Black & White, XY and Sun & Moon, their Radiant Collections and many of their Black Star promos (Reshiram bw1-113 offered only Standard). A card changes only where TCGplayer's product and Scrydex's page both name a holofoil and no plain printing (`holoNotNormal`), or a holofoil beside a plain printing one of them names (`holoBesideNormal`, Emboar bw1-19, whose plain print came in a theme deck), both in reverse-holo.generated.json and written by reverse-holo-evidence.mjs. The Black & White holo cards offered no holo at all. A copy already recorded keeps its finish. reverse-holo-evidence.mjs now reads a Scrydex page that answers 404 as empty instead of stopping.

- Data health checks that a card whose rarity says holo (Holo Rare, and its V, VMAX, VSTAR and LV.X kin) offers a holo, as card-printings.ts decides it: a holo in TCGdex's variants, or one of the evidence run's holo lists. On 2026-09-15 all 2,066 do; before api#495 two thousand did not.

- A Japanese copy of a mirror holo, Poké Ball, Master Ball or other reverse is priced from its own TCGplayer product, as an English one has been since 2026-09-14. Until now every Japanese copy read its card's plain product: a Master Ball Bulbasaur of Pokémon Card 151 at $0.21 where its own product reads $43.17, and a mirror holo had no figure at all. The products are the ones the print-pictures cron matched (`card_print_pictures`), read beside the card's own for the collection (`collection-facts` v26) and written into the price history by the nightly TCGplayer cron: a mirror as the card's `reverse-holofoil`, a ball as `poke-ball-reverse-holofoil` and on. Their history starts the night this ships.

- A Japanese card offers the printings TCGplayer sells of it, not only the ones TCGdex lists. TCGdex names a mirror holo for 513 Japanese cards; TCGplayer sells some 890 as products of their own, and for about 400 cards the store held the mirror's picture while no form or switcher offered a Reverse. `GET /v1/cards/{tcgId}?language=ja` and the facts batch now add each printing `card_print_pictures` names, and the print-pictures cron writes a row without an image for a Japanese product TCGplayer holds no picture of (most Master Ball reverses), because the product still proves the printing. `card_print_pictures.image` is null for such a row.

- The price history backfill fills named Japanese cards with `--only japanese --ids a,b`, the way it already did English ones. The Japanese copy linked 569 priced cards on 2026-09-14 (SM10's Krabby and Martial Arts Dojo relinked, SM1p and SM2p found) that had a price and no line; the morning check named them and this filled them.

- Japanese cards say what they print. A card's rarity is its printed mark in English (SR is Super Rare, AR Art Rare, SAR Special Art Rare, S Shiny Rare, ● ◆ ★ Common, Uncommon, Rare), read from Scrydex with TCGplayer where Scrydex misreads a run, and a card that prints no mark has no rarity: 1,670 cards held the word "None" and 2,335 a word outside the one list, now none. 5,630 cards take their artist from Scrydex (562 left without), 5,456 their printed Japanese name (62 left), 2,905 Stage 1 and 2 Pokémon their evolution (80 left) and 2,627 evolutions written in Japanese are in English; a stage is written "Stage1" throughout. Names follow the English game: "M Houndoom-EX", "Reshiram & Charizard-GX", "Rayquaza ex δ", "Latias ☆", "Light Arcanine", "Heal Powder" for 粉末を癒します (1,201 names; 874 casing fixes, and 225 names that were still Japanese text). The copy builds the 118 cards TCGdex lacks where Scrydex lists them with a printed number: Shiny Treasure ex 127 to 166, the deck energies of VMAX Climax, CP4, S8a, S10b, the HeartGold and SoulSilver Collections and more, so no set is short of Scrydex's count; Blue Shock and Red Flash count 65 cards. Twelve set titles follow Bulbapedia and Scrydex (Facing a New Trial, Fever-Burst Fighter, Peerless Fighters, Sky-Splitting Charisma). The morning data check fails where a Japanese set holds fewer cards than it prints, and on Stage 1 and 2 cards without an evolution or cards without an illustrator past their ceilings. `scripts/scrydex-japan-cards.mjs` writes the Scrydex map by hand. The Bulbapedia comparison reads the Japanese Black Bolt and White Flare lists rather than the English ones, and leaves Start Deck 100 Battle Collection's holo dagger out of a name, which took 503 false differences off its report.

- Every priced Japanese card has its price history: 971,250 readings from TCGplayer's Japanese archive for the 6,585 cards the copy linked beyond the committed map, weekly before March 2026 and daily after. Before, 4,300 priced Japanese cards had a price and no line. `card-prices` cache v6, so no sheet keeps an empty line for its hour.

- Every priced Japanese card gets a line in the price history. The nightly price job wrote history only for the 9,259 cards in the committed Japanese map; since the Japanese copy matched 15,844 cards to TCGplayer products, about 4,300 priced cards had a price and no history. The job now takes the copy's products as well, and the backfill script's `--only japanese --copied-only` fills their past from TCGplayer's archive.

- Japanese cards carry their right English names and their own TCGplayer products. The name rules read only the mechanics a card prints (ex, GX, VMAX, δ, Star) and keep its owner and kind, so 957 names are put right: "Clefable Clefable" is Clefable, Bruno's Machamp and Erika's Oddish carry their owners, Dark Charizard and Shining Magikarp their kinds, SM12a's Lucario & Melmetal GX its partner, and a trainer is no longer named after a species its name holds (ポケモンファンクラブ is no Krabby). A vintage set's machine-translated printed name (おしっこ under Weezing) is no longer shown beside the English one. A card is linked to a TCGplayer product only where the names agree and to one product only, so SM10's Krabby, Martial Arts Dojo, MC's Exeggcute and neo2's Houndour (U) read their own prices and pictures, and the five cards that held another card's price history lose it. Nine sets TCGplayer titles differently are found by hand (Holon Phantoms, Pokémon Card Web, SM1p and SM2p among them), which links 523 more cards, and the duplicate sm2+ set is gone. TCGdex's swapped records for Fusion Arts 126 to 129 and Storm Emeralda 98 and 99 are read from the right numbers; Kagayaku reads Radiant Rare, a card with no rarity reads None, and ADV5's Dodrio is a Pokémon.

- Japanese sets show their logo. No source Card Orb read had a Japanese wordmark (TCGdex names none, TCGplayer and Limitless publish none); Scrydex lists one for every Japanese expansion and gave permission to keep them. The nightly Japanese copy finds each set on Scrydex by id, by English title, or by a short hand-read list where Scrydex titles a set differently, and keeps the logo in our own bucket: 165 of 169 sets, all but three starter sets and Detective Pikachu.

- 27 Japanese promo cards (26 in SV-P, Mega Zeraora ex in M-P) get a picture: the Limitless address for a promo set is built without its hyphen (SVP, MP), the way Limitless files it, where every guess used to be a 403.

- Home's movers are cached again. `/v1/movers` cached every reading of every held card over the period, 7.5 MB for thirty days, past the Data Cache's 2 MB an entry, so nothing was kept and every visit read the price lines again (production logs, 2026-09-15). It now keeps only each card's earliest and latest reading, all the ranking compares, read in parallel chunks and cached under the same tags, so the night's lines still arrive when the cron writes them.

- `GET /v1/movers?days=7|30|90|180|all&top=` answers the caller's cards whose price moved most over the period, up and down, ranked by what the move did to the collection. For Home's movers, over the period its value chart shows.

- `GET /v1/movers` answers each mover's `setAbbr`, the code printed on the card, so a list can show "XYP 124" as the collection does.

- My First Battle's Potion and Switch have a TCGplayer price. TCGplayer sells each as four products, one per deck, with no number, where TCGdex has one card; the Bulbasaur deck's product is taken by hand. TCGplayer has no photo of either, so they stay without a picture.

- The Bulbapedia naming comparison runs on request instead of every Monday: Bulbapedia refuses GitHub's runners (403 on the first run), so the scheduled workflow would only ever fail. `node scripts/bulbapedia-compare.mjs` from a Mac still reports every difference.

- Naming pass three against Bulbapedia's set lists: the copy's differences go from 764 to 16 in an offline run of the comparison over the live copy with the new rules (`scripts/bulbapedia-compare.mjs --copy`). Added to the copy: 91 English cards TCGdex does not list (56 Sun & Moon Yellow A Alternate cards under the set they print, the twelve Fighting Energy of the Lycanroc half deck, MEP 089 to 110 and 120) and 25 Japanese ones (the unnumbered pack Energy of SM1+, Ultra Force and Tag All Stars under their printed code, SV-P 147, 154, 291, M-P 052, 082, 135, 136, 147), with TCGplayer links and pictures. Names follow one set of conventions in both catalogues (Energy icons as letters, "Horror P Energy", "Unit Energy GRW"; bracketed subtitles, "Professor's Research [Professor Magnolia]"; no Team Flare Gear, Poké with its accent, GX and EX hyphenated), plus 32 cards named by hand (Melmetal-GX, Max Rod, Clefairy Doll, Mimikyu δ). The EX sets carry EX ("EX Deoxys"), trainer kits a capital T, nine Japanese sets the name Bulbapedia and TCGplayer agree on, five Japanese sets their printed total. Numbers as printed for the e-Card holos (H1) and BW004/BW005, the pack Energy of VMAX Climax, Pokémon GO and SM1+ by code (GRA). Japanese artists from Scrydex where TCGdex answers an empty string (236 cards). M-P 090 is Basic Lightning Energy and no longer carries Spritzee's product. The comparison reads a list's small print, a whole link's text, the Yellow A Alternate page per set, Unseen Forces' Unown letters and half decks, and treats TCGdex's empty duplicate sets as not compared; 179 remaining differences are accepted with a checked reason. CATALOGUE_FORMAT 4 (Japanese 11); set-catalogue v11, era-rarities v4, english-set v5, set-facts v32.

- Card numbers read as the cards print them in 15 more English sets: Sword & Shield through Fusion Strike, Celebrations, Pokémon Futsal 2020, the 2023 and 2024 McDonald's collections and the Nintendo promos print 001 where TCGdex writes 1, and the catalogue copy writes 001 from its next copy of each set (CATALOGUE_FORMAT 5, 1,045 cards). `printedNumber` on `GET /v1/cards`, the movers and the public cards answers the same, and e-Card's H1 where it answered H01. Card ids, pictures and prices do not move. Every place a number meets another spelling of it folds the two with one rule (`canonNumber`, src/lib/core/card-number.mjs): `GET /v1/cards?number=` finds a row stored as 1 when asked for 001, and a promo stored as 020 when asked for SWSH020; the set page's ownership, the duplicates filter, the public profile's counts and the CSV import's "already held" read it too, and `fold_card` folds a row spelt 1 into its twin spelt 001 (migration 20260915220000, `card_number_key`). The Dex export writes a number the way a Dex export does: digits without their zeros (1, 3), a lettered number as printed (TG03, SWSH179). data-health fails where an owner's row carries a number that is not its card's, and where a card of these sets is still spelt TCGdex's way.

- 65 foil cards in the owner's collection (XY and SM promos, Cosmic Eclipse's GX and Secret Rares, XY-era Secret Rare EX, Double Crisis) are recorded as the holo they are instead of the "normal" TCGdex calls a foil full art, so each is priced at its holo figure.

- Pictures no source the nightly copy asks has can be found by hand and committed with their source: public/pictures-by-hand/ holds the file, pictures-by-hand.json the page it was found on, and the nightly copy puts it in the bucket (`hand/`) only for a card or set every other source left blank. Bulbapedia is the source Bart allowed for these (2026-09-15). The first seven: Crossing the Ruins' second Ruin Wall (neo2-057, the Aerodactyl print), the My First Battle logo, and the Japanese logos of Wind from the Sea, Split Earth, Mysterious Mountains, Darkness, and to Light... and Expansion Pack 20th Anniversary. The other 19 blank cards and 34 logoless sets have nothing on Bulbapedia either.

- The API's own pages may load pictures only from images.cardorb.com and the Supabase project; TCGdex, pokemontcg.io, Scrydex and Limitless are off the list, since no answer carries their addresses any more (#484). The stored catalogue index is built once more in a new format, so a document from before #484 is never served, and the API reference no longer names pokemontcg.io as the catalogue's source.

- Every picture the API sends (card scans, set logos and symbols) is a file at images.cardorb.com, or null. A request no longer asks TCGdex, pokemontcg.io or Limitless for a picture: the collection's per-card fallbacks, the whole-set scan probe, pokemontcg.io's logo lookups on the shelf and a set page, and the Japanese set page's and search's TCGdex probe and Limitless guesses are gone. A set or card read live because the nightly copy does not hold it yet keeps its facts and carries no picture until the copy has put one in the bucket. `/api/cover`, the proxy for Limitless's scans, is deleted, and a row no longer remembers a picture that is not a file of ours.

- The price history knows which catalogue a card is from, so an English and a Japanese card that share an id can no longer read or overwrite each other's line. English and Japanese TCGdex ids collide (neo4-100 to neo4-113: neo4-106 is Shining Celebi in English and Lucky Stadium in Japanese), and on 2026-09-14 that put Japanese Chansey's figure in Shining Celebi's chart and Japanese readings under English ids. `card_price_months` is keyed on (language, tcg_id, printing, month) (migrations 20260915161000 and 20260915161500): about 238,000 rows of 14,878 Japanese-only ids are `ja` and about 1,058,000 are `en`, the 774 rows of the 14 shared ids among them because every printing is the English product's; none was ambiguous. The column has no default, so a writer that does not name the catalogue is refused. Every writer names it (the nightly price job, the snapshot, the backfill) and every reader asks for it: `GET /v1/cards/{tcgId}/prices` takes `?language=en|ja` (left out, the id's own catalogue, English where both have it), each `GET /v1/cards` item says its `catalogue`, and the movers and binder and Home lines match readings to a copy by catalogue and id. The guards that kept Japanese links off English ids are gone with the need for them, and the morning check "No Japanese price under an English id" is now "Price lines are cards of their own catalogue". `card-prices` cache v11.

- A card's price chart follows one printing on every day. The line took each day's plain printing, or else its foil, and a day its own printing had no figure fell to the next one: Base Set Charizard read its 1st Edition (about €4,800) on the 14 days its unlimited holo (about €750) was missing, and the chart spiked sixfold and back. A card's line is now the first printing in line it has on at least half as many days as its most-read one, and a day without it is left out. `card-prices` cache v7.

- A card's price chart shows the new day as soon as the nightly TCGplayer job has written it. The cached price lines were kept for an hour whatever happened, so the first time a card was opened after that hour it still showed the old line. The job now clears every cached price line once the day's prices are stored (`priceHistoryTag`).

- Price history fixes from four audits. Shining Celebi (neo4-106) no longer carries the Japanese Chansey's price: English and Japanese cards share 14 ids, and the price job and the backfill now leave a Japanese product off an English id. The price job dates prices by the day TCGplayer published them rather than the clock, so a run before 20:00 UTC no longer stores yesterday again as today, and reads the dollar rate fresh. 184 cards lose a flat `market` series an old collection snapshot wrote beside their real printings, ecard2-95a loses one day left from its previous product, and the Japanese copy stops building SM1+, SM3+, SM4+ and SM5+ from the TCGplayer groups SM1p to SM5p already read (every card had been in it twice).

- A promo you hold under its bare number ("260") is marked as held on its set page and sheet, where SWSH Black Star Promos files it "SWSH260": ownership now drops a promo set's letters, as the collection's matching already did. A card's price line is its holo where its plain printing is a few stray readings (ex8-15 read 95 days of "normal" beside 306 of holo). A card's sheet carries every printing's price and product (normal, reverse, holo, 1st Edition, Unlimited, Shadowless) for the sheet to show them apart, and the collection's prices refresh the night the prices do rather than a day later.

- The print-pictures cron writes its night again. TCGplayer lists two cosmos holo products for 18 English cards, the night's rows named those printings twice, and Postgres refused the whole write: the first hand run on 2026-09-15 copied 2,317 pictures into the bucket and stored none. Each printing is now named once, and the write drops a repeated row before it asks.

- A printing TCGplayer sells as a product of its own has its own picture. `GET /v1/cards/{tcgId}` gives each of `printings` (and each of `patternPrints.prints`) an `image`: the Poké Ball or Master Ball reverse's own photo, a Japanese card's mirror holo, a cosmos holo; null where there is none and the card's scan stands for it. A new nightly cron, `/v1/cron/print-pictures` at 23:00 UTC, copies those photos into our bucket once and writes them to `card_print_pictures`: 1,480 English products from the committed pattern map and about 1,060 Japanese ones, matched to the card their plain product is. A plain English reverse holo is no product of its own and has no picture; most Japanese Master Ball products have no photo at TCGplayer either. Base Set's Shadowless product is left out, because its photo is the 1st Edition print.

- Unown ? reads "#?" rather than "#%3F": the catalogue copy keeps a card's number as printed where TCGdex keeps it percent-encoded. The morning data check also fails where a priced card has no price line, and where a card number is still percent-encoded, the two slips found on 2026-09-14.

- Every card on `GET /v1/cards` and every mover carries `printedNumber`, the number as the card prints it ("XY124", "085"), and a set without an official abbreviation takes Pokémon TCG Online's code (Wizards Black Star Promos "PR", Nintendo "PR-NP", DP "PR-DPP", HGSS "PR-HS"). So a card reads the same everywhere and matches its print.

- Every card in a promo set has the rarity "Promo", in the English and Japanese catalogues and in every collection, because a promo prints a black star where a rarity symbol goes and no source says what kind of card it is. A rarity can no longer be set by hand: a PATCH that sends one changes nothing, and the card sheet no longer offers the rarities of the card's era. Rows that held a rarity named by hand say "Promo" now, and a Pokédex that keeps only some rarities keeps counting them.

- Public profile cards carry `printedNumber` and `setAbbr` as the owner's list does, so a public page labels a card as it is printed too.

- Whether a card has a plain reverse holo is decided from evidence, card by card: TCGdex's variants, TCGplayer's printings and Scrydex's variants, by majority, with Bulbapedia's set rule breaking a tie (`scripts/reverse-holo-evidence.mjs`, `reverse-holo.generated.json`). No card sold before Legendary Collection (24 May 2002), the first set with reverse holos, has one: Southern Islands' six foil cards and Wizards promos Scizor, Entei and Pichu are offered as the holo they are. A set's basic Energies of one kind are decided together, and a card leaves its kind only where every witness for it says so. A form now offers a plain reverse on 12,793 English cards, up from 7,996: every Black & White and XY set, most of Sun & Moon and EX Delta Species to Power Keepers, which TCGdex lists none for, and 35 that api#455 had hidden because TCGplayer lists no figure (fourteen Skyridge cards, eight Scarlet & Violet Energies); 8 pre-Legendary Collection cards no longer offer one. Expedition's basic Energy, Aquapolis's H cards and two Brilliant Stars Trainer Gallery cards stay without one. A reverse copy is priced from its own reverse figure or not at all: where TCGplayer has none, the copy is unpriced, in totals, binder lines and movers, instead of reading the plain reverse, the holo or the normal card. data-health reports where the witnesses disagree per set and fails when a copy is priced as another printing.

- Six cards printed only as a reverse holo offer only that finish: Thundurus BW41, Tornadus BW42 and Lillipup BW52 (TCGdex lists them as normal) and Stormfront's Drifloon, Duskull and Voltorb SH1 to SH3 (TCGdex lists them as holo). Bulbapedia names the one print for each and TCGplayer sells no other.

- The Japanese 25th Anniversary Collection (S8a) carries its title as the pack prints it, "25th ANNIVERSARY COLLECTION", instead of TCGdex's katakana; the last naming difference with Bulbapedia.

- Six more English cards have a picture, from Scrydex: the five cards of the Poké Card Creator Pack (Scrydex's wb1) and Pikachu at the Museum (a jumbo card Scrydex files as MEP 1000). My First Battle's Potion and Switch are the two English cards no source pictures. The catalogue cron takes `?sets=` to work a few sets out from scratch when a source is added for them.

- Japanese cards no other source had a picture of take Scrydex's scan, with Scrydex's permission: mostly the vintage shelves (Pokémon Card VS, the Gym sets, Neo, LEGEND, PCG) and the promos. Scrydex numbers some vintage sets its own way, so a card is matched by number only where Scrydex's name agrees with ours, by name where exactly one card carries it, and a card without an English name only in a set whose numbering was shown to agree. About 1,130 of the 1,194 blank cards were expected to match.

- No set wears Scrydex's generic Pokémon Trading Card Game wordmark as its logo. Scrydex answers that file for a set it has no logo for, and 29 of the 165 Japanese logos copied the day before were it (ADV, e-Card, neo, PCG, PMCG, CP6); those sets show no logo again. English sets TCGdex has no logo for take Scrydex's where it has a real one: the sixteen trainer kits, the McDonald's Collections 2023 and 2024, the Poké Card Creator Pack and Mega Evolution Energy.

- Seven old Japanese cards get Scrydex's scan (neo1 New Pokédex, World Champions Pack Flareon, Vaporeon and Jolteon ☆ and Energy Removal, VS1 Bugsy's Technical Machine 01 and 02): their Scrydex numbers are kept by hand, and the Scrydex step still runs by the set's known code when scrydex.com's expansions page does not answer in time.

- A set's cards say whether each is a full art (`fullArt`), English and Japanese alike, from the flag the catalogue's copy decides at night. The set page's Full art filter can now read the API's rule, which counts the shiny V and VMAX cards and TCGplayer's own "Full Art" products (Jolteon V 177 in Evolving Skies among them), rather than keep an older copy of it. A set read live from the catalogue, before the copy has it, leaves the field out.

- Set facts put right from a check against TCGplayer and Scrydex: Red Flash shows its own logo rather than Blue Shock's; CP5 and SV4a show their own Japanese names rather than XY11b's and SV3a's; nine release dates move to the day both sources agree on (XY3 Rising Fist no longer sits after XY4; McDonald's Collection 2024 is January 2025); ADV1 is ADV Expansion Pack apart from the 1996 Expansion Pack; the Japanese shelf reads newest first, as the English one does, and never shows a set as holding fewer cards than it does; and Yellow A Alternate, six cards already on their own sets' pages, is no tile of its own. The corrections live in set-corrections.ts and apply on every nightly write.

- Wizards, Nintendo, DP and HGSS Black Star Promos show their Pokémon TCG Online code in the collection too: the per-set facts cache is keyed anew (set-facts v32), so a day-old entry without the code is not read.

- Seven English cards are priced from their own TCGplayer product: Hau #19 and #23 and Great Ball #21 and #25 in the Lycanroc and Alolan Raichu trainer kits, Acro Bike in the Latios kit and Tierno in the Suicune kit each read the other half-deck's product, and Nintendo Black Star Promos 36 Tropical Tidal Wave read a Worlds staff card's. Their history is rebuilt from TCGplayer's archive, and the link test no longer allows trainer kit halves to share a product.

- The set shelf leaves out sets with no cards in the catalogue copy: Sample, W Promotional, Jumbo cards and Radiant Collection in English (Radiant Collection's cards are Generations' RC run, already there), and the four Japanese sets neither TCGdex nor TCGplayer lists cards for. Unseen Forces' Unown Collection is part of Unseen Forces on the shelf, as a Shiny Vault or Classic Collection is part of its set, its A to Z, ! and ? counted with it.

- The Scarlet & Violet basic Energies 009 to 016 no longer offer a Cosmos reverse: TCGdex lists one, while TCGplayer and Scrydex both show only the plain card, a reverse and a Cracked Ice holo. The other 17 cards TCGdex lists a plain and a Cosmos reverse for (151, Paldean Fates, Temporal Forces, Prismatic Evolutions) keep both: TCGplayer sells the Cosmos print apart, or Bulbapedia names it.

- Pokémon Card 151's Japanese Poké Ball reverses get TCGdex's scans as their picture. TCGdex photographed that set in its Poké Ball print (twelve cards across the set looked at on 2026-09-15; the September 11 note calling them the Master Ball print was wrong), and the 153 cards the copy lists with a Poké Ball reverse are the ones scanned that way; the rares from 166 on are scanned plain and get nothing. The nightly print-pictures cron copies those scans before TCGplayer's product photos and replaces a photo it already held for the same printing. `card_print_pictures.product_id` is null for such a row.

- A printing's TCGdex scan keeps TCGplayer's product beside it. The print-pictures cron wrote 151's 153 Japanese Poké Ball scans without a product, and a Japanese reverse is priced by its product since the reverses got their own prices, so those copies had no figure and no history. A held scan row without the product is written again.

- The Japanese copy also reads TCGplayer's Japanese shelf, where TCGdex falls short. The 53 Japanese sets TCGdex lists without cards (Shiny Star V, Eevee Heroes, the 25th Anniversary Collection, every SM+ set) get TCGplayer's card list, one card per printed number with its English name, rarity, type, HP and stage; a card TCGdex and Limitless have no picture of gets TCGplayer's product picture, matched by number or, on the unnumbered vintage shelves, by English name; and each card keeps its TCGplayer product, so the new cards are priced like every other.

- Black Bolt Haxorus and White Flare Emboar and Gothitelle in the owner's collection are the holo they are, not a normal print none of them was ever printed as, so they are priced at the holo figure and the morning check's finish check passes.

- The English price history loses 55,308 rows a mistaken backfill run wrote on 2026-09-15 under the retired `market` and `holo` printing names for February and March 2024. The run touched no existing row, so the history is as it was before.

- The Unseen Forces Unown Collection wears the Unseen Forces wordmark, the set whose boosters it came in; no source publishes a logo of its own. The nightly copy puts it in place.

- The nightly value point on the Home chart counts priced and unpriced copies, as the collection stats do. It counted `cards` in copies but `priced` and `unpriced` in different cards, and a card held twice with one copy unpriced counted as priced: the owner's points for 2026-09-13 and 09-14 read 1,928 cards, 1,611 priced (the different cards held) and 0 unpriced. Both counts now read one rule (`copyUnpriced`), so priced and unpriced add up to the copies held and unpriced is the number `/v1/stats` says. Those two points and one of another account's stay as written: the prices they were counted at are not stored, so the right counts cannot be worked out afterwards. data-health checks that every account's latest point adds up and that the owner's unpriced count matches the held copies without a figure for their own printing.

## 2026-09-14

- Dragons Exalted 117 Blend Energy GFPD links to its TCGplayer product (normal and reverse holo priced), by hand: TCGplayer names it "Blend Energy GFPD" where TCGdex spells the four types out. 25 English cards stay unlinked.

- A card whose TCGdex record names a scan with no file behind it (404 for the small or large one) gets TCGplayer's picture instead, copied into our bucket: nine English cards on 2026-09-14, among them Team Magma's Numel (dc1-1) and Leftovers (sv03.5-163). The README has a Card pictures section for the bucket, the Worker, the secret and the fill script.

- Every Monday the catalogue copy's names are put beside Bulbapedia's, and an issue titled "Naming differences" says where they differ: each set's name, its size and printed total, and each card's number and name, with a name told apart from a spelling of it ("Impostor" beside "Imposter" is a name; "Mewtwo ★" beside "Mewtwo ☆" is a spelling). Nothing is changed by it. `src/lib/core/catalogue/bulbapedia-sets.json` says which Bulbapedia page and list each of the 372 sets is (366 found, six with the reason they have none), and a difference kept on purpose goes into `bulbapedia-accepted.json` with its reason. The first run, on 2026-09-14, compared 197 English and 169 Japanese sets: 81 and 32 clean, 6 and 26 short of cards, 87 and 776 card names that differ. Bulbapedia is asked five seconds apart, and only for pages edited since the last run.

- Rarity and types corrected for 481 English cards, applied where the catalogue reads TCGdex's facts (`card-fact-corrections.ts`): 460 cards TCGdex gives the rarity "None" (trainer kits, McDonald's collections, Pokémon Rumble, Kalos Starter Set) take TCGplayer's; 16 Pokémon with no type get TCGplayer's Card Type; five types TCGdex has wrong, where TCGplayer and pokemontcg.io agree, are fixed (Drampa, Quagsire, Hariyama, Sandshrew, Dark Houndoom). A correction applies only while TCGdex still says what was corrected. `english-set` v2, `set-facts` v26.

- Opening an English card reads its sheet from Card Orb's own copy of the catalogue: illustrator, HP, stage, what it evolves from, regulation mark, its printings and print runs, the languages it was printed in, its era's rarities and its foil rule. The sheet used to ask TCGdex on every open (the card's record, five other-language catalogues, the set's record and two GraphQL questions), so a slow or down TCGdex made the sheet slow or empty. The nightly catalogue copy now keeps these facts from the question it already asks per set, plus one read per language per set, and copies every set held in the older shape again first. A card the copy does not hold yet is still read from TCGdex.

- The catalogue cron drops the collection's day-long set caches (tag `catalogue`, stale while they refresh) whenever a run changes a card's picture, and reports how many it changed (`pictures`). Until now nothing dropped them: after the move to images.cardorb.com the collection kept naming TCGdex for all of its cards. `set-facts` moves to v24 for the entries already on disk.

- The collection and adding a card ask outside sources less on a request. A set's prices come from the stored TCGplayer prices first; TCGdex is asked only for a card published since the weekly TCGplayer links run, and no longer for the cards known to have no TCGplayer product. A card the nightly copy already checked for a picture is not looked up at Limitless or pokemontcg.io again, a set's logo is the copy's own, and the finish a new copy gets by default is read from the copy's printings. The nightly copy now asks TCGdex's GraphQL again after a pause when it answers busy, which left 144 of 203 sets uncopied in one run on 2026-09-14. `collection-facts` v19, `set-facts` v29.

- The assembled collection's cache key moves to v14, so a collection built before the pictures moved to images.cardorb.com is not read: v7 of the set catalogue alone left 1,461 cards on TCGdex addresses.

- A collection is priced from `tcgplayer_prices`, a table a new daily cron (`GET /v1/cron/tcgplayer-prices`, 21:15 UTC) fills from tcgcsv, instead of one TCGdex request per card: 1,633 requests for the owner's collection, which a cold instance waited 7 to 12 s for. Compared on 2026-09-14 over 1,559 held cards with the same pickers: the printings, product ids and first-edition figures are the same on every card both price, the market figure within 5% on 93%, and 187 cards TCGdex has no TCGplayer figure for are now priced. TCGdex still answers for a card with no TCGplayer link, and for every card until the table holds a figure from the past week. Needs the `tcgplayer_prices` migration.

- Every morning a check reads the copy the pages read and files an issue where it is not whole or current: sets behind or not refreshed for a week, per catalogue; cards without a picture in our own bucket; today's TCGplayer prices and the dollar rate; and every card's newest history point against today's price for the same printing, which is how Base Set Machamp's line from another product would have been found (scripts/data-health.mjs, data-health.yml).

- The Japanese catalogue is copied into Card Orb's own store every night, beside the English one and in the same tables: every set with its English and printed name, every card with its facts (rarity, types, illustrator, HP, printings) and its picture in our own bucket, TCGdex's scan where it has the plain print and Limitless's where it does not. A row is now a card of one catalogue, keyed by language and id, because the two catalogues share ids (Neo Destiny 100 to 113). The search column also matches a card's printed name. Nothing reads the Japanese copy yet; the pages move onto it next, once it is compared with TCGdex.

- The nightly catalogue copy may run for five minutes, as the price job does. The Japanese copy reads one record per card, and its first run was cut off after four sets at the one-minute limit.

- Japanese cards have a price history from mid-December 2024, per printing: every day from March 2026 and one reading a week before, the same shape as the English archive. `scripts/backfill-card-prices.mjs --only japanese` writes it that way now (it wrote the two old series once a week up to August 2026), and passes over an archive whose Japanese files are empty, as tcgcsv's were for most days until 2024-12-14.

- The price job (`GET /v1/cron/tcgplayer-prices`) reads TCGplayer's Japanese shelf too, into `tcgplayer_prices` and a day of history per printing under the card's Japanese id, from tonight: 22,445 printings, 9,259 cards linked. Its answer adds `japanese`. A Japanese card's chart has a line from 2026-09-14; the months before are filled in later from tcgcsv's archive (from 2024-08-24).

- Japanese pages read Card Orb's own copy of the Japanese catalogue: the set list, a set's page, the search, a Japanese card in the collection, its sheet and the finish it gets by default. They asked TCGdex (and Limitless for pictures) on every view; now TCGdex is asked only for a set or card the copy does not hold yet. A Japanese set page and search show each card's rarity, which the copy keeps, where they showed none, and a Japanese search matches both the English name and the printed one. The nightly copy also keeps TCGplayer's product picture for a Japanese card neither TCGdex nor Limitless has, which is every promo.

- Base Set Machamp's 1st Edition price line follows the printing its sheet prices. TCGplayer sells two 1st Edition Machamps, Deck Exclusives ($27.42 on 2026-09-14) and Shadowless ($88.13); the sheet showed the first and the history held the second, so the card read a 68 percent drop that never happened. The price job and the backfill keep a card's own product when its Shadowless run has a printing of the same name, and the 306 days since 2024-02-10 are rewritten from TCGplayer's archive.

- Eight My First Battle cards (the four starters and their Basic Energy) link to TCGplayer's plain printing, where TCGplayer also sells a Blue Border one and the links run took neither, and XY Trainer Kit (Noivern) Switch links to "Switch (Noivern)", which TCGplayer numbers 4 where TCGdex says 29. By hand, checked against the set's other scans on 2026-09-14. Both a picture and a price for them now; 26 English cards stay unlinked.

- A collection is joined once per instance when several requests ask for it at the same moment: /cards, /stats and /folders on the app's first screen used to each build it on a cold instance, every price read to TCGdex made twice (3,265 reads where 1,633 do, measured locally). A join that fails is not handed to the next request. The API also logs `[timing] event loop blocked Nms` for any second the server was held for a quarter of a second or more, to read beside the other timing lines.

- One price job: `GET /v1/cron/tcgplayer-prices` (21:15 UTC) reads tcgcsv once and writes both `tcgplayer_prices` and today's point in the price history for every card TCGplayer sells, per printing and with Base Set's Shadowless runs under their own printings (`shadowless`, `shadowless-holofoil`, `1st-edition-holofoil`). Its answer adds `history`, `thinned` and `databaseBytes`, and the 480 MB daily ceiling moves there. `GET /v1/cron/snapshot` keeps the collection value work and writes card prices only for held cards with no TCGplayer product; `everyCard`, `everyCardDaily`, `databaseBytes` and `?all=1` are gone from it. The price history keeps every day for the last six months and one figure a week before that: the job thins up to three older months a night (migration 20260914150000), so a card's chart over years shows weekly points.

- A set page, a search, a card's sheet and the collection read a card's price from the same place: the TCGplayer prices the nightly job stores (`tcgplayer_prices`), for English and Japanese cards alike. The sheet read TCGdex's relay and the lists a tcgcsv file up to a day old, so one printing could show three figures in three places. tcgcsv's files are read only when the store holds nothing from the past week or cannot be read. `collection-facts` v18, `set-facts` v28.

- Every English rarity has one spelling, and old holo cards their real grade (Bart, 2026-09-14). TCGdex's sentence-case words ("Double rare", "Illustration rare") and "Rare Holo" read as TCGplayer spells them ("Double Rare", "Illustration Rare", "Holo Rare") on every read from TCGdex: the set facts, the card sheet, search, era rarities and other language catalogues (`rarity-names.ts`). 1,273 cards TCGdex calls "Rare" take TCGplayer's Holo Rare, Ultra Rare or Secret Rare (Base Set Alakazam is a holo). Migration `20260914200000` moves what is stored to the same words: copies (`cards.rarity`), binder rules and Pokédex settings, and an English copy of a corrected card still saying "Rare". Cache keys `collection-rows` v3, `collection-facts` v17, `set-facts` v27, `set-catalogue` v9, `english-set` v3, `era-rarities` v2.

- Card pictures are copied into our own Cloudflare R2 bucket (`cardorb-images`, read at images.cardorb.com) and the catalogue copy hands out that address: the set page and the search stop depending on TCGdex, pokemontcg.io and Limitless answering. Writes go through the `cardorb-images-writer` Worker (`cloudflare/images-writer`) with `IMAGES_WRITE_SECRET`; without the secret, or while images.cardorb.com does not answer, every address stays the source's. `scripts/copy-images-to-bucket.mjs` does the first fill.
- TCGplayer is a picture source for a card TCGdex has no scan of, by the product the price links name for it: 474 of the 649 catalogue cards with no picture (McDonald's Collections, Classic Collection, Unown Collection, Aquapolis and Skyridge holos, eight trainer kits).

- The shelf and a set page answer faster: marking a collection against the English sets resolved every row's set name on its own, 1,946 times for 52 names, which took 400 to 520 ms of each answer on Vercel. It resolves each name once now (105 ms to 8 ms on a laptop), with the same marks and counts for every account.

- A card's price history starts on 2024-02-08, the first day of tcgcsv's archive, for every card. The weekly TCGplayer sales averages before it (November 2022 to November 2023, 451 cards, points two or three weeks apart and no sale at all from December 2023 to February 2024) are removed, and so are the plain and foil series of August and September 2026 wherever a real printing has the same readings. `GET /v1/cards/{tcgId}/prices` no longer answers `source: "tcgplayer-sales"`.

- A `Price` is `{ market }`: TCGplayer's market figure in euros, and nothing else. `low` (TCGplayer's lowest listing), `avg30` and `nm` are gone from every price, and `priceHolo` from `GET /v1/cards`, the collection's cards and the catalogue's set page, search and card list; all of them had been null or unused since Cardmarket left on 2026-09-12. `tcgplayer_prices` drops its `low` column, and `CATALOGUE_SET_PRICING_MAX` (Cardmarket's set pre-pricing) is no longer read.

- `GET /v1/public/{username}/collection` no longer carries `pricePrintings` or `printingIds`: every printing's euro figure and its TCGplayer product reached a public profile's answer, though the page showed neither. Both are null there now, like `price`.

- The price history of the seventeen cards relinked in #410 is deleted (it was another card's, back to 2024-02) and written again from TCGplayer's archive by `backfill-card-prices.mjs --only daily --ids`. That mode now sends one reading a week before the last six months, as the price job keeps them, instead of every day, which would have left those months daily for good; weekly archives stay in the cache.

- The nightly catalogue copy asks pokemontcg.io and Limitless about every card of a set TCGdex has no scan for, not only the first 40: 213 cards were left with no picture on the set page and in the search (Crown Zenith Galarian Gallery GG41 to GG70, 82 of Shining Fates' Shiny Vault, 38 of Dragon Majesty, 36 of Shining Legends, 27 SM Black Star Promos). A set neither catalogue has is given up on after ten misses. A blank card in a set the other two do have files for is asked again, so the copy fills those in as each set comes up for refresh.

- Scrydex's stand-in picture is told apart by its ETag, not its length: Scrydex sends a server no Content-Length, so #407 refused every real scan and the seven trainer kits stayed blank.

- Scrydex is the last picture source for an English card no other catalogue pictures: seven trainer kits read by hand (XY Latias, Latios, Bisharp, Wigglytuff; SM Lycanroc, Alolan Raichu; HGSS Gyarados), 170 of the 178 cards without a picture on 2026-09-14. Its stand-in picture is refused by its length. `docs/sources.md` lists every outside source both apps read, what for and when.

- `GET /v1/catalog/search` marks what you hold against the English sets out of the catalogue's copy, the list the shelf reads, instead of TCGdex's index on every search; TCGdex is asked only when the copy is empty, or by the search's own fallback for cards the copy does not hold.

- A set's logo and symbol are served from images.cardorb.com: the nightly catalogue run (`GET /v1/cron/catalogue`, now answering `art`) copies each into our bucket and points `catalogue_sets` at the copy, so a shelf tile no longer loads from assets.tcgdex.net or images.pokemontcg.io. A file that cannot be copied keeps its source address and is tried again the next night.

- A set's logo and symbol in the catalogue copy are our own copy of the file or nothing. Every set symbol TCGdex names answers 404, and two logos (Undaunted, Furious Fists) exist only as PNG, so the copy held 167 addresses on TCGdex's host with no file behind them. A logo published only as PNG is copied as PNG; a file that is not there is left out; a source that did not answer is tried again the next night.

- The collection reads card pictures from images.cardorb.com from the first request: the set catalogue's cache key moves to v7, so entries built before the pictures moved are not read.

- `GET /v1/catalog/sets/{setId}` reads an English set out of the catalogue's copy in Postgres, one query, where it asked TCGdex for the set's record and then its rarities and types. A set the copy holds no cards of yet (jumbo, rc, sp and wp today, or one published since last night) is read from TCGdex as before. All 199 copied sets were compared card by card with the TCGdex answer on 2026-09-14: the same fields, values and order.

- `GET /v1/catalog/sets/{setId}` answers faster: an English set with its rarities and types is kept a day (it was asking TCGdex's GraphQL on every request), the viewer's rows are read alongside the catalogue, and the pictures and prices of the page at the same time. `pageSize` is clamped to 500 rather than 250, so a Scarlet & Violet set with its secrets comes in one request.

- `GET /v1/catalog/sets` and a set page read the English sets out of the catalogue's copy, logos included, instead of asking TCGdex's index and pokemontcg.io for 57 logos on every cold instance; TCGdex is asked only when the copy is empty or unreadable, and by the nightly run, which stores each set's resolved logo now. Compared on 2026-09-14: all 203 sets identical in every field and in order. Sets released the same day are ordered by id on both paths, so five pairs (dp1 and dpp among them) swap places once.

- Prices in euros no longer wait on an outside currency service. The nightly price job now stores the European Central Bank's dollar rate in our own database, and every request converts TCGplayer's dollars at the latest stored rate. Only while no rate is stored yet does the API still ask frankfurter directly.

- Seventeen English cards link to their own TCGplayer product instead of another card's, found by laying TCGdex's list beside TCGplayer's: Pokémon Rumble 5 Starmie and 6 Gyarados (were Ninetales), Nintendo Black Star Promos 16 Treecko (was Torchic), seven Brilliant Stars Trainer Gallery cards (were their main-set namesakes), SM Trainer Kit (Alolan Raichu) 2 Lightning Energy, Celebrations Classic Collection CC020 Reshiram and CC021 Zekrom (were the Celebrations main set), and Aquapolis 50b, 74b, 103b and 95a (were their a/b twin). Each was priced, and a gallery card pictured, as the other card. A test now fails when one product is linked to two cards that are not one printing listed twice. `collection-facts` v16, `set-facts` v25.

## 2026-09-13

- The English shelf shows a Trainer Gallery or Galarian Gallery inside its set, not as a set of its own: `GET /v1/catalog/sets` leaves the gallery out and adds its cards and counts to the parent's, with `gallery: { name, total }`; `GET /v1/catalog/sets/{setId}` lists the gallery's cards after the set's own. A gallery's own id still answers. Every Black Star Promos set wears the black star, and a set TCGdex has no logo for (Temporal Forces, the McDonald's Collections, 57 of 203) takes pokemontcg.io's where one is at `images.pokemontcg.io/<id>/logo.png`, checked once a day.

- Card prices are stored per printing, a month to a row (`card_price_months`, migration 20260913220000), so every English card can have a price for every day on the free plan: about 115 MB a year where one row a day was about 1.2 GB. `GET /v1/cards/{tcgId}/prices` adds `printings` to each point (every printing's figure that day, by TCGplayer's name); `market` and `holo` are unchanged. The Home line, a folder's line and the movers value a copy at its own printing (a 1st Edition copy at the stamped run's history). The cron writes every printing it prices. `backfill-card-prices.mjs --only daily` fills every day for every English card from 2024-02-08, per printing. The migration copies the sales averages before 2024-02-08 and everything since 2026-08-16; `card_prices` is dropped by hand afterwards.

- `GET /v1/cards` filters by a copy's `condition`, `finish` and `language`, each repeatable like `rarity`: any value of a key counts, every key must hold. A copy with no language is English and matches `language=en`; a copy with no condition or finish matches no value of that key. A finish outside the list is a 400. `facets` gains `conditions`, `finishes` and `languages`, and `counts=1` gains `condition`, `finish` and `language`. The public cards route is unchanged.

- `GET /v1/cards?counts=1` says how many cards each filter option would leave, for a filter sheet that writes the number beside the option. `counts` has one tally per set (by title), rarity, generation and type, each over the cards the other filters leave with that key's own choice set aside, plus how many would remain with `fullArt=1` or `duplicates=1` added. Without `counts=1` the answer is unchanged.

- Card Orb carries English and Japanese only. `?language=` on the set list, a set page, the search and a card answers 400 for `ko`, `zh`, `zh-tw` and `zh-cn`, as it does for any language it does not know. A copy's `language` is one of `en de fr it es pt nl ja`: an edit to anything else is refused, and a new card with another language is stored with none, as before for an unknown code. The Korean and Chinese shelves, their card and set name maps, and their species names are gone. No row carried one of those languages, and the iOS app reads none of them.

- 169 more English cards are linked to TCGplayer, and 74 ids of sets TCGdex no longer lists leave the map: cards without a product outside Pokémon TCG Pocket go from 288 to 45. Each card the linker could not place was diagnosed, and the gaps were spelling, not missing products. `tcgplayer-links.mjs` now reads a card's name as TCGplayer writes it (◇ as "Prism Star", ☆ as "Star", δ as "Delta Species", "Impostor" as "Imposter", "Unit Energy GrassFireWater" as "Unit Energy GRW", "Fairy Charm Grass" as "Fairy Charm G", "Team Flare Gear" dropped) and a product's without what TCGplayer adds ("Basic ", " LV.X", " -BW47"). Where the number is written another way it takes a card by name alone, only from the set's own group, only as the one plain product of that name there, and only against a product with no number or a plain one for the card's code: Celebrations' Classic Collection ("CC002" is "4/102"), My First Battle and the Sun & Moon basic energies. A first version also allowed one promo code for another and linked a BW promo Raichu to "Raichu - DP21"; that is refused now. Pokémon Futsal's five promos come from "Miscellaneous Cards & Products".

- The snapshot cron prices every English card every night, not only on Saturdays, while the database is under 480 MB, and goes back to Saturdays above it (the free plan's limit is 500 MB). It reads the size through `database_size_bytes()` (migration 20260913200000, service role only) and reports `databaseBytes` and `everyCardDaily`. The Japanese shelf is no longer priced: nobody holds a Japanese card, and the room goes to the English one.

- A card added to one set no longer sends every set in the collection back to TCGdex. The collection facts are kept per person and dollar rate, each set with the signature it was resolved for, and only a set whose printings changed is resolved again. Measured before: one add made `/stats` 8.3 s and `/folders` 8.5 s.

- The Home value line values a card at its last TCGplayer reading, up to 14 days old, on a day without one. Weekdays have readings only for the cards held when the nightly series began and 2026-08-16's were empty, so the rebuilt line jumped between Saturdays and weekdays (EUR 40,000 and 28,000 on one collection) and fell to zero on 08-16. Rebuild an account's line with `?history=1` on the snapshot cron.
- `backfill-card-prices.mjs` reads the dollar rate from a week before its first day. `--only recent` starts on Sunday 2026-08-16, the ECB publishes no rate on a weekend, and all 1,361 readings of that day were written without a figure.
- `backfill-card-prices.mjs --only held-daily` writes a reading for every day from 2024-02-08 for the cards held now (`--from`/`--to` to resume), and the Home line is built from daily readings from that day: every day since February 2024, where it was Saturdays until 2026-08-16. The cron no longer rebuilds a history that has a weekday in it, only one never built; a daily rebuild of a large collection is minutes, so `?history=1` is for a local run of the route.

- The Home line counts a copy from the day it was added or from its card's first TCGplayer reading, whichever is later, so a card added before it had a price (a pre-order, a set bought on release day) joins the line and its ring on the day it is worth something rather than standing as unpriced. A card with no reading at all still counts from the day it was added, unpriced. Rebuild an account's line with `?history=1`.

- A Japanese card you hold or open is priced from TCGplayer, like every other card: its figures come from TCGplayer's Japanese shelf on tcgcsv, printing by printing, in euros at the day's rate. A held Japanese card had no price and carried Cardmarket's foil figure as `priceHolo`; `GET /v1/cards/{tcgId}?language=ja` had no price at all. TCGdex relays no TCGplayer figure for a Japanese card, so nothing of TCGdex's pricing is read for one any more. Where TCGplayer prices nothing the card has no price. Measured on eleven Japanese sets (1,737 cards): Cardmarket priced 1,594, TCGplayer prices 1,440; the gap is mostly the Scarlet & Violet promos (SV-P, 108 of 288 on TCGplayer against 248 on Cardmarket).

- `GET /api/v1/public/[username]/latest-pull` also returns the copy's `finish` and `foilPattern` and the card's `gen` and `types`, so the portfolio can draw it with the same holographic foil as the web app. Still no price.

- Eight more English cards link to TCGplayer (45 unlinked to 37): a product with the card's own number whose name is one or two letters off (Neo Destiny "Dark Exeggcutor", Lost Thunder "Fairy Charm O"), a number TCGplayer writes with a prefix ("SVP 175", "SVP193") against TCGdex's plain one, "Delta" for δ (Holon Phantoms and Dragon Frontiers' Rainbow Energy), and, for a set TCGdex links no card of itself, the group this script already filed nine in ten of its cards in (SVP Black Star Promos). `backfill-card-prices.mjs --only daily --ids a,b` fills the history of cards linked since the daily run.

- `GET /v1/cards/{tcgId}` offers only runs and foils that were printed. `editions` reads TCGplayer's printings first: a card TCGplayer sells only as 1st Edition has no `unlimited` run (Base Set Machamp answers `["1st-edition", "shadowless"]`). New `foilPatterns`: `[]` for a card of a Wizards of the Coast series (Base to e-Card), whose holos had their set's one foil, so a form asks no pattern; `null` everywhere else, which is no answer.

- A copy you own always has a finish. A card added without one gets the catalogue's only printing where TCGdex lists exactly one (a Special Illustration Rare becomes holo), and normal otherwise; a CSV import does the same, asking TCGdex once per card. The store backs that up: an owned row written without a finish is given normal by a trigger, and a check refuses an owned row without one. Wishes keep no finish. Eevee, Wizards Black Star Promo 11, is recorded as holo.

- Wizards Black Star Promo 1 Pikachu is priced ($46.54): it was linked to "Pikachu (1) (Misprint)", which TCGplayer prices at nothing, because the linker took the first product with the card's name and number. It now takes a plain product before a variant (misprint, error, prerelease, staff, jumbo, exclusive, stamped), then one whose name carries the card's number, then one with a price; and it corrects its own earlier link only where that link is a variant with no price, inside the same group. Two looser versions were tried and rejected: re-choosing every unpriced link swapped two Victory Cups to another season's print, and re-choosing the group sent Pikachu to "Pikachu (Ivy)".

- Reading a large collection's price history no longer overflows the stack (a chunk over two and a half years is some 190,000 days), and writing a night's printings sends 500 rows two at a time with three tries each, where one of eight requests at four in flight failed on the first night of every printing. The card-price and value-history caches take a new key, so entries cached while the backfill ran are not served.

- `GET /v1/catalog/sets/{setId}` always answers `set.abbreviation`: the code printed in the corner of the set's cards (POR for Perfect Order), the same value a collection card's `setAbbr` carries, or null where the catalogue has none. English sets already sent it; other languages now send null instead of leaving it out. The set list does not carry it.

- The English shelf shows Hidden Fates' and Shining Fates' Shiny Vault and Celebrations' Classic Collection inside their set, as it shows the galleries, and marks a card of theirs held by its SV or CC number. Two more cards link to TCGplayer by hand, found searching every group for the 37 left: Sword & Shield #178 Professor's Research (Professor Magnolia), which two products shared a number for, and SVP #500 Terapagos & Friends, a jumbo card TCGplayer files as one (37 unlinked to 35).

- Seven cards read as one copy of two with no finish (Charmander and Charmeleon from 151, Snivy and Victini from Black Bolt, Tepig, Emboar and Oshawott from White Flare) where the shelf holds two different finishes. The Notion import left their finish empty, and the fold of identical rows on 2026-09-11 took a normal and a reverse holo for the same thing. A migration splits each back into its two finishes, as their Notion pages name them. Pansear from White Flare goes back from two of each finish to one (a second Notion entry at 013, which is Emboar, had been moved onto it), and three Special Illustration Rares with no finish are recorded as holo.

- `GET /v1/value-history` says on each point of the collection's line how many copies were added since the point before (`added`) and what they were worth that day (`addedValue`, whole euros), so a chart can mark the day and split a change into cards added and prices moving. Stored in `collection_value_snapshots.added_cards` and `added_value_cents` (migration 20260913180000); the nightly point counts since the point before, a rebuilt history (`?history=1`) fills the past. A folder's line does not carry them.

## 2026-09-12

- A set no longer loses its cards, its prices or its pictures for a day because the catalogue had one bad second. An answer that contradicts itself, or a picture host that is briefly unreachable, is asked again instead of being written down as the truth.

- The unlimited printing of a card is no longer priced as the holo of the same name. Jungle, Fossil and Team Rocket number their holo and their plain version apart, and 236 cards across those and other sets read the holo's Cardmarket product: Fossil Gengar 20/62 said €202.12 where the card sells at €29.05, and Team Rocket Dark Charizard 21/82 said €460.29 where it sells at €59.98. A collection holding them is worth less than it said, and says so now.

- A card keeps the picture it has been seen with. The scan is still worked out from the catalogue on every read, so a better one is picked up the same day, but the card no longer goes blank when the catalogue is briefly silent about the set it is from.

- Five XY promo alternates are priced: Jirachi XY67a ($257.56), Yveltal-EX XY150a, Karen XY177a, M Camerupt-EX XY198a and M Sharpedo-EX XY200a. TCGplayer files them in its "Alternate Art Promos" group rather than beside the ordinary printing in "XY Promos", which is the only group `tcgplayer-links.mjs` looked in; a promo line now names every group its cards can be in.

- The links in the confirmation and password-reset emails point at cardorb.com again, and the emails say the link lasts an hour, which it does.

- The three auth emails are rendered from cardorb-web on Untitled UI's email kit: the same wording, the app's pill button and type.

- The three auth emails are rewritten: a heading, one sentence, one button, the link written out under it, and a footer that says who it was sent to and why. The password mail is now "Reset your Card Orb password".

- Set pages, search and the catalogue's card list are priced from TCGplayer, a tcgcsv group at a time, like every other price in the app. They read Cardmarket's guide, so a set page showed one market and the collection another. Measured: 151 prices 207 of 207 cards, Crown Zenith's Galarian Gallery 70 of 70, the Japanese M1S 92 of 92, each from one cached request. Korean and Chinese pages carry no price, as TCGplayer does not sell those cards.
- `scripts/tcgplayer-groups.mjs` writes which tcgcsv group each TCGplayer product is in, for both shelves: 20,035 English and 9,259 Japanese products the id maps know, all of them found.
- Cardmarket's price guide is no longer downloaded anywhere: the collection asked it first and used nothing it said. `catalogue/price-guide.ts` and the guide's shards are deleted.

- A catalogue card says what kind of card it is, so an app can tell a full art Supporter apart from a gold Item: the two share a rarity and look nothing alike.

- A card can be the face of its Pokédex slot: the picture a slot shows when you own several cards of the same Pokémon. The app sets it when you stop swiping, and clears the one it replaces. Visible on the public profile as well, so a visitor's Pokédex opens on the card its owner chose.

- A copy says which print run it is from: 1st Edition, Shadowless or Unlimited, a third axis beside the finish and the foil pattern. The CSV import reads it from Dex's Variant word and from a column of its own, the export writes it, and a 1st Edition copy is its own line rather than one more of the unlimited row.
- The dollar price of a Jungle, Fossil, Team Rocket, Gym or Neo card is the ordinary run's, not the stamped one's: TCGplayer splits the two and the 1st Edition figure was taken first, so an unlimited Neo Genesis Lugia read $1,085 where it is $519.

- The Cardmarket id maps, the product links, their scripts and the weekly Cardmarket audit are deleted: nothing has read a Cardmarket price since #362. The Japanese, Korean and Chinese shelves read which sets have cards from `recorded-sets.generated.json`, written by `scripts/recorded-sets.mjs` from TCGdex; it was read off those maps, and the sets are the same (116, 3, 8 and 83). `snapshot-collection-value.mjs`, which valued a collection from archived Cardmarket guides, goes with them. The `null` Cardmarket fields the API still sends (`priceHolo`, `priceShadowless`, `cmId`, `cmUrl`, `market`) are next.

- `GET /v1/cards?duplicates=1` answers only the owned printings held more than once, the copies to trade or sell. A printing is the card, its finish and its run: a holo and a reverse holo of one card are two printings, and condition, grade and language do not split one. Quantities add up across rows.

- `GET /v1/cards` and `GET /v1/public/{username}/cards` take several values for a filter: repeat `set`, `rarity`, `gen` or `type` (`?rarity=Rare&rarity=Rare%20Holo`) and a card matching any of them counts, while different keys still narrow together. One value works as it always has. At most 50 values per key; `number` stays one.

- Search results, the catalogue the browser searches in and a set's cards from the copy now list cards the way a binder holds them: XY2 before XY10, 20 before 100, and a set's Trainer Gallery after its main run instead of in the middle of it. They used to be sorted as text. The collection has sorted this way since #356; the catalogue now follows the same rule, worked out in the database so paging through a search stays in one order.

- A card TCGdex has no scan of now carries a picture in search and on its set page, from the second catalogue, instead of an address with nothing behind it. Pikachu with Grey Felt Hat (svp-085) was the card that showed it: the collection has always found its picture, the search never did, so it drew a blank square right up to the moment it was added. The catalogue's copy checks these addresses while it is being filled, so a reader pays nothing for it.

- A collection is read from one cache entry instead of one per set: a warm read on a fresh instance touched 112 entries and now touches 7, measured on the same collection.

- Your collection keeps opening while the card catalogue is down: the cards come from the app's own copy, without pictures or prices, instead of a page that will not load.

- The collection can be exported as a CSV in the shape Dex writes (semicolons, the same columns), collection and wishlist in one file, with the condition, language and acquired date after Dex's columns; GET /v1/collection/export.

- A 1st Edition copy is priced as the stamped run where anything prices that run apart: TCGplayer does for Jungle, Fossil, Team Rocket, Gym and Neo, converted to euros. Cardmarket publishes one figure per card and it is the ordinary run's, so the two are never averaged.
- Which price series a copy reads is one function, copyPriceOf(), instead of the four copies of that sentence in cards.ts, items.ts and twice in snapshot.ts.
- The card facts say whether a stamped first run of the card exists (TCGdex knows), so a form can stop asking which run a copy is from on a card that was printed once.

- Every card's price history is TCGplayer's, end to end. The weekly point for a card nobody holds comes from TCGplayer's figures on tcgcsv, for the English and the Japanese shelf, instead of Cardmarket's guide, so a card's chart no longer changes markets halfway along.
- A reading says which market it is from. The nightly points had been written without a source, and the column's default labelled them Cardmarket whatever they were.
- The weekly pass runs on Saturdays, the day the 2.8 million archived weekly points are on. It ran on Mondays, so the two series never lined up.
- `scripts/backfill-card-prices.mjs --only recent` rewrites the weeks since 2026-08-16 from TCGplayer's daily archive and deletes the Cardmarket readings nothing could replace. Before it: 65,490 Cardmarket rows beside 3.06 million TCGplayer ones.
- Gone with the guide: `snapshotOf`, `cardPricesOf` and `cardPricesFromGuide`, the three ways the history was priced from Cardmarket. Browse and search still price shelves from the guide; that moves next.

- Every Mega Evolution card is priced. TCGdex writes "M Manectric EX" and Cardmarket writes "MManectric EX", one space apart, so no Mega ever matched a product and the whole of them stood without a price; the same space stood between Nidoran♀ and "Nidoran ♀". 52 cards are linked by it. Where one name covers a Mega and its own secret rare, the second card is left for a person rather than put on the first one's price.

- The full art Venusaur EX (XY123) and Blastoise EX (XY122) are priced as themselves again. Both hung on the Cardmarket product of the plain promo of the same name, and the plain XY28 and XY30 hung on theirs, so each of the four read the other's price: Venusaur EX XY123 said €5.12 for a card that sells around €117.

- Search and the collection can be narrowed to full art cards: the ones whose illustration covers the whole card, wherever they sit in the rarities.

- The catalogue copy can be asked to work every set out from scratch, for the day a new source of scans is added: the cards that were copied without a picture were told "no" by the sources of that day, and nothing would ask the new one about them otherwise. The nightly run never does this by itself.

- A held card's price history is recorded in the market the card shows: TCGplayer's printings first (the ordinary run for the plain series, the foil for the holo one), Cardmarket's figure where TCGplayer prices nothing. Points before 2026-09-12 stay Cardmarket's, since no archive of TCGplayer's exists to redraw them from.

- The Home chart's history is built again from the price history: what the collection held each Saturday since 2024-02-10 and each night since 2026-08-16, at that day's TCGplayer prices, a copy counting from the day it was added. It held what the nightly snapshot wrote at the time (Cardmarket's guide, its Near Mint estimate, then an average of two markets) and two points valued from archived Cardmarket guides, so the line ended some €8,000 above the collection's value and would have dropped overnight. The nightly cron rebuilds an account once, when its history still has a weekday before the nightly series or has none while the collection held cards then; `?history=1` rebuilds every account, for after the price history itself is rewritten.

- A CSV row is recognised by the catalogue id where it has one: Dex writes it in its sixth column and this app read it as nothing, so a card whose set the collection filed under another name was matched by name and number instead of exactly.
- The first import preview of the day no longer waits on a hundred set reads: only the names of rows with no catalogue id are resolved, which on a Dex export is usually none.

- The CSV import counts a card as already held when the collection filed its set under another name (Notion wrote "Set 1 Unlimited" for Base Set): both sides are keyed through the set's official name.

- The CSV import preview hands the screen twenty rows instead of five, enough to see set names and printings come through right.

- A CSV preview now says, per row, whether it names a card you already hold, not only how many of them there are. An import screen can point at the rows it means instead of leaving you to find them.

- A CSV preview now hands back every row it would write, each with the line it came from, so an import screen can put a tick beside each one. Commit takes the lines you unticked as `exclude`, counts them apart from the rows it could not read, and answers with how many cards your collection holds when the writing is done.

- A correction to the catalogue reaches the search the same day. The document the browser searches in was kept for a day without asking, so a card whose picture was fixed this afternoon stayed a blank square until that day was up; it is now checked against its version on every page load, which answers with no content where nothing has changed.

- 754 more cards have a TCGplayer price, and the ones that do not are counted. `tcgplayer-links.mjs` matches an unlinked card against every one of TCGplayer's English groups instead of a hand-picked group per set: a group nobody listed was a card with no price and no warning, which is how Jirachi XY67a went unpriced. A card is linked only when its number and name agree and the group is the set's own (TCGdex's home group for the set, or a "Home: Subset" group of it; for a set with no home, the group whose name shares most with the set's). Of the owner's 1,609 held cards, 3 are left without a product, down from 217 this morning.
- `scripts/tcgplayer-coverage.json` records what is still unlinked per set (348 cards, outside the digital Pokémon TCG Pocket sets), and `verify.sh` fails when the committed map holds more: a new set nobody has run the linker over.

- 60 more cards are linked to TCGplayer, the owner's last three unpriced cards among them. `tcgplayer-links.mjs` reads TCGdex's ♀ and ♂ as TCGplayer's F and M (Nidoran♀ Jungle 57 is "Nidoran F", and every Nidoran, Unown and Pokédex name with a bracket now matches), and takes a card from the groups TCGplayer files many sets in, "Deck Exclusives" and "Alternate Art Promos", when the printed total is the set's own count as well: Machamp Base Set 8 ("Machamp - 8/102") and Shaymin EX Roaring Skies 77a ("77a/108"). Machamp's Shadowless run is in Deck Exclusives too, so it has one after all, and offers it again. 288 cards are left without a product, down from 348.

- A migration is applied by GitHub Actions after its pull request merges, instead of by hand. The workflow waits for Vercel's Production deploy of the commit to succeed, then runs `supabase db push`, so the history table records every file it runs. Two pairs of files shared a version (`20260911200000`, `20260912140000`), which the history table cannot hold; the second of each is now `…0001`.

- Every price is TCGplayer's, converted at the day's rate, or there is none. The two markets were averaged, which put half of a holo's figure on the plain rare beside it without saying so: a Team Rocket Dark Golbat read €30.46 on Cardmarket's shared product where TCGplayer said €5.83. A card TCGplayer does not price, about one in eight and mostly promos, now reads no price rather than the other market's.
- The estimated Near Mint band is gone with it. It was a ratio fitted to Cardmarket's trend, and nothing reads that trend any more.
- A copy whose finish nobody has filled in reads the plain card's figure, not the reverse holo's. Through TCGplayer's printings it had been reading the reverse, which counted every unclassified modern common at several times its price. A holo copy no longer falls through to a reverse's figure either.
- A reverse holo's price is TCGplayer's reverse-holofoil printing rather than Cardmarket's foil fields, and a held card's price history no longer falls back to Cardmarket where TCGplayer prices nothing: no price, no point.
- A card's detail (`GET /v1/cards/{tcgId}`) carries TCGplayer's figure and `tcgplayerId`, the product the figure is from; `market`, `priceHolo` and `priceShadowless` are sent as null until no client decodes them.
- Not yet: the nightly cron's weekly pass over unheld cards still writes Cardmarket's guide, and the Shadowless run has no figure of its own. Both move to TCGplayer through tcgcsv's archive in the next change, along with a rebuild of the price history from one source.

- The Pokédex is a binder you make yourself now, not a fixture. The setting that lived on your profile became a binder called "Pokédex" carrying the same range, rarities and public flag, and it can be edited and deleted like any other binder.

- A binder shown as a Pokédex fills itself from the Pokémon in its range, rather than waiting for cards to be filed in it by hand. The binders made when the Pokédex stopped being a fixture said "0 cards"; they hold the collection again.

- The two Pokédex fields on a profile are gone, and so is `GET /v1/pokedex` and the `list=pokedex` gate on a public profile. The Pokédex is a binder, and a binder carries its own setting; nothing is left on an account for a thing the app no longer has.

- A card answers which printings of it exist. `variants_detailed` says per card what was printed and what its foil is called, so the finish and foil questions in the apps finally have an answer to narrow to: Pikachu with Grey Felt Hat is a plain normal, and stops offering a holo, a reverse and the two ball prints. The Poké Ball and Master Ball reverses are named per card too, where they used to be offered on anything with a reverse.
- A card answers which print runs it can be from. TCGdex says whether a stamped first run exists; Cardmarket prices Shadowless as a product of its own and the map of those 102 products (all of Base Set) is in this repo. So a Jungle card offers 1st Edition and unlimited, where it used to offer a Shadowless run that was never printed.
- Dutch is no longer asked of TCGdex. No Pokémon card is printed in it and TCGdex keeps no Dutch catalogue, so the question could only ever 404, and where nothing could answer the apps offered Dutch as a printing.

- Eighteen more sets say which languages they were printed in: the nine POP Series, the four EX and two DP and two HS trainer kits, and Pokémon Rumble, which was English only. The Black Star Promo sets and four odd ones out of the EX era are not there, because Bulbapedia does not say: a promo was handed out per region rather than released as a set, so those keep asking TCGdex per card.

- Venusaur EX sits between Blastoise EX (122) and Pikachu EX (124) in XY Black Star Promos again, instead of at the bottom of the set. A promo number written with its set's letters (XY123, SWSH050) now sorts as the number it is, is saved without those letters like every other card of its set, and the database refuses one that still has them, so a script writing to it directly cannot bring the problem back. Trainer Gallery and other lettered subsets (TG01, RC5) keep their place after the main run.

- 968 promo and subset cards have a price again, from TCGplayer: the Galarian Gallery, four Trainer Galleries, both Shiny Vaults and the SV, SWSH, SM, XY, HGSS, WotC and ME Black Star promo lines. TCGdex relays no TCGplayer figure for any of them, while TCGplayer prices them in groups of their own; `scripts/tcgplayer-links.mjs` matches each card to its product on tcgcsv by set, number and name, and the collection asks tcgcsv for those groups. Of the owner's 217 held cards without a price, 209 are priced. Celebrations Classic Collection is not linked yet: its numbers do not line up.

- A public profile's folder list says when a binder is shown as a Pokédex, so a visitor's page can draw its slots instead of a list of cards. The rule behind a binder stays private, as it was.

- A card's rarity can be set by hand through PATCH on a collection item, alone or on many at once. Every card in a promo set answers "Promo", which names the set and not the printing, and no catalogue publishes what such a card actually is; the owner can see it and now say it. Null puts it back to "nobody has said".

- A set's name is no longer stored as a card's rarity. Every card in a promo set answers "Promo", and "None" is the same answer spelled differently; both now leave the column empty, which is the true answer, and the catalogue can no longer put either back over a rarity its owner set by hand.

- A card's languages are the ones it was really printed in. Portuguese standing alone beside English is TCGdex' Portuguese catalogue translating a card that was only ever English (Pikachu with Grey Felt Hat, svp-085), so it is no longer offered as a printing; and a catalogue that is asked and does not answer now means "not known", where it used to quietly read as "never printed in it".
- A card the catalogue cannot name carries the rarities its era printed. Measured from the sets of the card's own TCGdex series, so a promo from 1999 is offered Common, Rare and Uncommon, and a Scarlet & Violet promo the words that era has.

- A set page shows the rarity of every card again. Sets with a short id (Sun & Moon, XY) lost it on the back half of the set, the full arts and the secret rares included.

- Base Set's Shadowless and 1st Edition runs have prices of their own again, from TCGplayer's Shadowless group on tcgcsv, where "Unlimited" is the Shadowless run and "1st Edition" the stamped one. Charizard reads €742 ordinary, €1,928 Shadowless and €8,541 1st Edition; all three read the ordinary figure since the move to one market. 101 of 102 cards linked.
- A card offers Shadowless as a print run where TCGplayer has a Shadowless product for it, not for all of Base Set: Machamp no longer offers it.

- A Shadowless copy is priced as the Shadowless product Cardmarket files it as, on the card, in the collection's total and on the value chart, where it used to read the unlimited printing's figure (base1-4 Charizard: €3,567 against €583).
- Added `scripts/cardmarket-ids-editions.mjs`, which reads which product each of a card's print runs is from TCGdex's `variants_detailed` and commits the map. Of 23,548 English cards, the 102 of Base Set are the ones Cardmarket prices apart.

- A copy reads TCGplayer's price for the printing it actually is (holo, reverse, 1st Edition, unlimited), where before every copy of a card read whichever printing that record listed first: a Jungle Scyther holo read the plain rare's figure.
- TCGplayer's figure now answers before Cardmarket's, which files several printings of one card under a single product and was wrong by multiples on those. Cardmarket still answers for every card TCGplayer does not price.
- An item says which market its figure came from, which printing it was, and TCGplayer's product id for that printing, so a figure can be opened and checked.

- The printing a copy reads now travels as a price of its own, so the app can show it: the item sent the card's price fields and the reader worked out which one applied, and a figure that was not among those fields could not be chosen however well this side had chosen it.

- A collection now takes its sets from the catalogue's nightly copy in the database rather than asking TCGdex on every read. The pages come up faster, and a catalogue that is slow or unreachable no longer reaches the cards at all. A set published today is still fetched live, until the copy has been through it.

- A Cardmarket link that points into the wrong expansion is now found rather than believed. `node scripts/cardmarket-ids-fill.mjs --audit` reads the links that are there and asks whether each product sits in the expansion its own set does; 73 of 20,907 do not, and none of them is a card this collection holds. It runs weekly on its own.

- The languages a copy may be set to come from the source that can answer for the card's set. TCGdex answers per card for the sets its catalogues carry, which is the better grain; for the 47 sets before Black & White it does not carry them (its Spanish and Portuguese records for Base Set hold zero cards, its Italian one holds nothing for Fossil or Diamond & Pearl, and it keeps no Dutch catalogue at all), so those sets are answered from Bulbapedia's own per-set list, scraped and checked in. A Base Set card offers all seven languages it was printed in, Dutch included; EX Team Rocket Returns offers English and Portuguese, which is what it was released in.
- Dutch is a printing language again. It was dropped this morning on the grounds that no card was printed in it, which is wrong: Base Set, Jungle and Fossil were released in Dutch, and nothing after. It is never asked of TCGdex, which has no Dutch catalogue; those three sets are in the map.

- More of the cards TCGdex has no scan of get a picture: the catalogue's copy now asks Limitless as well as pokemontcg.io, which between them answer for cards neither did alone (Oddish, SVP 102, is Limitless's; the Pikachu with the grey felt hat is pokemontcg.io's). And a nightly refresh keeps the pictures it worked out before instead of asking after every one of them again, so the whole catalogue is fresh again in a night rather than two.

- Two cards can no longer quietly come to share one Cardmarket product. The 2,054 that still do are written down per set, and the check refuses any set that gains one, so the number can fall and never rise.

- The four fields every page needs about the person asking are kept on the instance for a minute instead of read from Postgres on every request. The query is 0.1 ms in the database by its own statistics, but getting to it had a p90 of 8.4 seconds on production, so one page load in ten waited eight seconds on it.

- Every keyed request used to wait on a Postgres read of your profile before it did anything else, whether it needed it or not. Nothing but a rename does, so nothing but a rename asks: the collection, the lists and the statistics answer without it.

- New cards are linked to TCGplayer once a week without anyone remembering to. `.github/workflows/tcgplayer-links.yml` runs every Saturday: it adds the English cards TCGdex has published since the last run (`scripts/tcgplayer-ids.mjs`, which needs no database key, unlike the backfill it replaces for this), refreshes which tcgcsv group each product is in, links what `tcgplayer-links.mjs` can, and opens a pull request when anything changed, with the check dispatched on its branch. It needs "Allow GitHub Actions to create and approve pull requests" switched on for the repository.

- The full art Venusaur EX (XY123) and Blastoise EX (XY122) are priced from the XY Black Star Promos products rather than from a Japanese card of the same name: €96.39 and €196.76 instead of €116.93 and €78.71. Cardmarket names a product after its attacks and never after its number, so three cards can carry one name inside one expansion and a dozen carry it across the catalogue; the expansion is the half that tells them apart.

## 2026-09-11

- `scripts/backfill-card-prices.mjs` goes on when TCGdex refuses one card. With twenty thousand cards to ask about, one refusal at card 1,482 threw the other answers away and stopped the run; a refused card is now left out of the map, so the next run asks again, and the TCGplayer ids of the whole English shelf are committed: 19,067 of 23,622 cards have a product.

- A card from the Japanese, Korean or Chinese shelves lands in its Pokédex slot. It is named in
  that language and the species list is English, so every one of them was filed nowhere — which
  on that page reads as "you do not own this". `scripts/pokedex.mjs` now writes the same 1,025
  species in those languages beside the English ones, and the matching takes the longest name in
  whichever script the card is written in.
- `scripts/pokedex.mjs` writes where the file actually lives. It resolved `lib/core` rather than
  `src/lib/core`, so it threw before writing anything — the fourth script with that gap.

- A Japanese set TCGdex has not photographed shows Limitless's scans instead of a grid of grey boxes. On 2026-09-11 there was no file behind 41 of 72 sampled Japanese cards across eight sets, whole sets at a time (SV5M, SM12a, SM1M: 12 of 12); Limitless has them at an address built from the set's abbreviation, four sets of four checked. One probe per set decides; a photographed set keeps TCGdex's smaller files. Korean and Chinese shelves are unchanged — Limitless carries neither. `GET /v1/catalog/sets/{setId}?language=ja`.

- A set page on the Japanese, Korean or Chinese shelf prices its cards. It showed a blank line under every card while Cardmarket priced them — all 92 of メガシンフォニア are in the guide the API downloads daily — because the only map from a card to its Cardmarket product held English cards somebody owns. `scripts/language-cardmarket-ids.mjs` asked TCGdex about every card on those shelves once (21,333 of them) and committed what it found, one map per catalogue since the ids collide between them: 10,350 of 12,781 Japanese cards carry a product, 3,861 of 7,436 traditional Chinese, 742 of 877 simplified, all 239 Korean. The page reads its own catalogue's map and pays no request it did not pay before. `GET /v1/catalog/sets/{setId}?language=` is where it shows.

- Every card on the English shelf is priced, not only the ones somebody owns. A set page priced its cards from a committed map of card to Cardmarket product, and that map was only ever filled from the collection: 1,634 cards in 58 sets, so an English set showed a price under the owner's cards and a blank line under the rest. `scripts/language-cardmarket-ids.mjs` fills the English map the way it fills the Japanese one, and 19,939 of the shelf's 23,622 cards are linked.
- Every card gets a price line. The nightly cron wrote a reading for held cards only, so a card nobody owned opened on an empty chart. On Mondays it now also writes the guide's price for every card the five id maps know, some 35,000, one point a week; `?all=1` runs that pass on any day. `scripts/backfill-card-prices.mjs` fills the English shelf's past from TCGplayer's archives, weekly since 2024 — the other shelves start the week they were first written.
- The cached price guide is read in four shards per catalogue. One entry holding the whole English shelf would pass the data cache's two-megabyte ceiling and not be cached at all, which is the fourteen-megabyte guide downloaded on every set page.

- The rows cache can no longer be filled with rows from before a write. It was cached an hour under a tag every write dropped, and a read begun just before a write stored what it had read — the rows from before — after the drop: two presses on a count within a second left `GET /v1/cards` saying four copies for an hour while the row said two (cardorb-web #360). Every write now moves `profiles.cards_version` (a statement trigger on `cards`, migration `20260911200000`), and the cache is keyed on it, so a late read stores where nothing looks again. A store without the migration keeps the tag alone, as before.

- `CatalogueSet` carries `cardsRecorded`: whether the catalogue has recorded the set's cards, or only the set and its count. Always true for English. TCGdex lists 68 of 184 Japanese sets and 92 of 95 Korean ones with a count and no card, and `GET /v1/catalog/sets?language=` said "60 cards" for those like any other; it is read off the committed Cardmarket id maps, so it costs no request and is as current as their last run. `GET /v1/catalog/sets/{setId}` answers it from the cards themselves.

- Removed `getCardsStats()`, the whole-collection tally left behind when the web tool moved to its own repository. Nothing but its own tests had referenced it since; `/v1/stats` is answered by `countStats()`. It also carried a live arithmetic fault its own comment forbade — a `movement` percentage pairing the blended market price against Cardmarket's raw thirty-day average, which reported +13.75% for a card that had not moved at all — and twenty-one green tests said the arithmetic was fine. What moved is answered by the movers, out of the recorded daily readings.

- A value history that could not be read is a 503 rather than an empty series. `GET /v1/value-history` answered `200 {"snapshots": []}` when the store was unreachable — the same payload as an account that has never been snapshotted, which both clients draw as the brand-new empty state — while the same route's `?folder=` branch already answered 503 to the same failure. `GET /v1/cards/{tcgId}/prices` had the same shape: its own documentation calls an empty list the honest answer for a card whose history has not started, and an outage was sending it too. Both now say which happened, the way the collection routes already did.

- A Japanese card you own from a set TCGdex has not photographed shows Limitless's scan, as the set page has since #262. The collection path resolves a card on its own, so it asks once per card whether TCGdex's file is there (a HEAD, cached a day) and hands over Limitless's guessed address where it is not; a probe that cannot be made keeps TCGdex's address. Korean and Chinese cards spend no probe. `GET /v1/collection`, `/v1/cards` and the public profile carry it.

- Searching for a card to add answers in a fraction of a second. The English catalogue is copied into the database once a night (`GET /v1/cron/catalogue`), rarity and types included, and `GET /v1/catalog/search` reads the copy instead of asking TCGdex twice per keystroke — the second of those, the facts of the twenty hits over GraphQL, took two seconds on its own. Before the first night has run, and for the other languages, the search asks the catalogue as before. Needs the `catalogue_cards` migration applied.

- The catalogue can be searched in the browser. `GET /v1/catalog/index` is every English card as one compact document, cached a day under its version, and `GET /v1/catalog/cards?ids=` attaches owned, wishlist, quantity and the day's price to the hits on screen. A search that asked a server was 0.7 to 1.0 s of round trips with the query itself at 1 ms; searched in the browser it is the keystroke. Needs the `catalogue_index` migration applied.

- `language` accepts `zh-tw` and `zh-cn` beside `zh`. Chinese is two catalogues, traditional and simplified, and the shelves name them apart; a card added from a Chinese shelf arrived as `zh-tw`, failed the list, and was stored with no language at all, after which it was looked up as an English card by its set's name. A `zh-tw` or `zh-cn` row asks its own catalogue and no other; `zh` stays for the rows that carry it and asks both, traditional first, as before. The iOS app decodes no language field, so nothing there changes.

- A Japanese, Korean or Chinese set page names its cards in English — "Charizard ex", not リザードンex — with the printed name beside it as `localName` for a sheet to show in brackets. The names come from Cardmarket's product list through the committed product id maps, and for a Pokémon Cardmarket does not sell, from its species and printed suffix: 12,308 of 12,781 Japanese cards, 6,582 of 7,436 Traditional Chinese, 823 of 877 Simplified, all 239 Korean. A trainer or energy neither source knows — old-era Japanese promos, mostly — keeps its printed name. `scripts/language-card-names.mjs` writes the maps.

- The public species list now carries each Pokémon's official artwork, so a Pokédex can show what is missing and not only that something is.

- The Japanese, Traditional Chinese and Korean shelves no longer list TCGdex's fifteen placeholder sets (CS1a … CS4Da: one record named Triplet Beat, counted 101, with no card behind it, copied under fifteen ids on each shelf). A set that shares its name and count with another on the shelf and records no card is left out; a real set with no cards yet stays. CP5 is named Mythical & Legendary Dream Shine Collection.

- Identical copies are one row with a quantity, in the store and not only on screen. Pressing minus on a card held as several identical rows used to raise the count instead of lowering it, and changing a condition split the copies in two; every write now folds what it makes into the row already held.

- The Japanese set M3 (ムニキスゼロ, 2026-01-23) is titled Nihil Zero on the shelf, Bulbapedia's rendering; it was the last Japanese set shown in its own script.

- Nidoran♂ (Base Set 55) is linked to its Cardmarket product by hand, so it is priced from the guide like the rest of the collection rather than by a request to TCGdex on every read.

- `cmUrl` on `GET /v1/cards/{tcgId}` and the public card is null, on purpose. The address was built from the card's name and the set's, and the button it fed landed on the wrong page or on nothing; Cardmarket publishes its product ids but not the expansion half of a product's address, and its site answers every probe with a bot check, so the right page cannot be guaranteed. Null hides "Buy on Cardmarket" in the iOS app without a release; the web had not drawn it since #215. The links map and `cardmarketUrl()` stay for when the address can be made to hold.

- The English shelf, the set pages and the search leave Pokémon TCG Pocket out: TCGdex carries the mobile game's fifteen sets beside the printed ones, and a binder cannot hold one. A Pocket set asked for by id answers 404.

- Added `PATCH /v1/collection/items`: the same inventory change on up to a hundred rows at once, `ids` beside the fields `PATCH /v1/collection/items/{id}` already takes. Four identical copies are four rows in the store, and saying "these are Near Mint" about them was four round trips from the web app, each folding the rows on its own; it is one statement now, folded once.

- A set id TCGdex lists twice on a shelf (CSV1C on the Simplified Chinese one: a 9-card Gem Pack and the 127-card 亘古开来) shows once, as the entry its own page opens on; the shelf drew both under one key and a link from either landed on the same page.

- Searching the catalogue for a card to add asks TCGdex now, not pokemontcg.io. The old host had started refusing roughly three requests in five, and a search for "charizard" came back empty often enough to read as "no such card". Same one box, same answer shape; every hit now carries its TCGdex id, so a card added from search is priced from the day it is added.

- `GET /v1/catalog/search` answers `total` beside `cards`: how many the whole search matched, so a client can say "125 cards" above the page it shows. At most the 250 the search reads, which then means "at least".

- TCGplayer's price — the second market blended into every English card's figure — comes from TCGdex now, off the card's own record, instead of from pokemontcg.io per set. That host had come to answer one set in eight, so the same card blended two markets on one instance and stood on Cardmarket alone on the next; TCGdex carries the number for every card of 151. pokemontcg.io is asked for nothing about prices any more.

- The two cards relinked in #299 are priced now rather than after a day: the per-set cache that holds a card's price moves to a new key, so the old entries with no price are not read.

- A set goes by its official name. `set` on every card of `GET /v1/cards` and `GET /v1/collection`'s set `name` say the catalogue's title, and two filing names for one set ("SV Black Star Promos" and "SVP Black Star Promos") fold into one set, their cards at one number into one card. A set the catalogue does not know, and a set from another language's catalogue, keep the name the cards were filed under. Card keys are unchanged. `set=` filters and folder rules take either name, as before, and a search word matches the title too.

- Five tests were asserting less than they said. The public collection route's test ran over an empty fixture, so every assertion in it passed with the call that strips prices, purchase prices, conditions, grades, notes and row ids deleted from the route. The API host's test read four exported constants and never called `nextConfig.rewrites()`, so returning nothing from it kept the suite green while `api.cardorb.com/v1/*` would have 404ed for both clients. The body-size check asked its question per file rather than per handler, so an uncapped new handler beside a capped one was invisible, and it never looked at the limit being passed. The public-variant allow-list filtered by value over a fixture that nulled two of the fields it was meant to guard. And no test anywhere asserted the sentence a folder 404 sends. Each is now held to what it claimed, and each was checked by breaking the thing it guards and watching it go red.
- `openapi.yaml` is now held to the statuses its handlers can answer, not only to their paths and methods — read out of the route sources, one handler at a time. That is the check the ten undocumented statuses above went through.

- The Japanese shelf has a price history too, from August 2024. TCGplayer sells Japanese cards, and the same archive the English backfill reads carries them from 2024-08-24; its set code and card number are TCGdex's Japanese id, so `scripts/backfill-card-prices.mjs --only japanese` maps 9,259 cards from TCGplayer's own lists (`tcgplayer-ids.ja.generated.json`) and writes their weekly readings in euros. Korean and Chinese cards TCGplayer does not sell; their lines begin with the cron.

- A collection card off the Japanese, Korean or Chinese shelves carries what it prints as `localName` on `OwnedCard` and `CardItem`, for a sheet to show in brackets after the English name; null on English cards.
- `GET /v1/catalog/search?language=ja|zh-tw|zh-cn|ko` with a Latin-letter term matches the English names those cards are shown under — "charizard" finds every Lizardon — off the committed maps, newest set first, with no request to the catalogue beyond the sets on the page shown. A term in the shelf's own script still asks TCGdex, as before.
- The 46 Simplified Chinese sets and two coming MEGA sets (Abyss Eye, Storm Emeralda) have English titles in the hand-kept lists. The Chinese ones are literal renderings, not official names: correct them.

- A public profile's cards carry `localName` too — what a Japanese, Korean or Chinese card prints, null on English cards — so a visitor's sheet can show it in brackets after the English name.

- `GET /v1/catalog/search?language=ja&set=…` keeps to that set, named as the shelf shows it (its English title, its own name, or its id), with or without a name beside it — the palette's Set chip works on every shelf. A type is not asked on those shelves: TCGdex publishes none there.

- 971 more English cards are priced: Gym Heroes and Gym Challenge whole, the Black & White and Sun & Moon promos, the XY trainer kits, and the printings Cardmarket lists several times under one name. `scripts/cardmarket-ids-fill.mjs` recognises a set nobody has linked a card in by which Cardmarket expansion carries its names, tells one printing from another by the attacks in Cardmarket's brackets, and skips the Pokémon TCG Pocket sets, which have no physical card to price. 232 stay unlinked, mostly names the two catalogues spell differently.

- Two more Cardmarket products are set by hand, so the last two unpriced cards in the collection are priced from the guide: Nidoran♀ (Jungle 57), which TCGdex does not link, and Pikachu EX (XY124), which TCGdex linked to a Pikachu with no price.

- Two database reads that stopped at PostgREST's thousand-row cap now page. The value snapshots are ordered oldest first, so the cap would have dropped the *newest* readings: at a thousand nightly points — around mid-2029 on this deployment — the value chart would have frozen at a date and gone on drawing, with nothing reporting a fault. The account list feeds the nightly snapshot and the warm cron, so past a thousand accounts the rest would never have been valued or warmed. Both now read every page, driven by the count, and throw rather than hand back a short list — the same paging the collection read has always used, now written once and shared by four callers.

- `public/openapi.yaml` now describes ten statuses the routes could already answer and it did not: a 404 from `POST /v1/cards` for a folder that is not yours, a 400 from both `/v1/catalog/sets` routes and from `GET /v1/cards/{tcgId}` for a language nobody has, 403 and 429 from `GET /v1/imports`, 415 and 502 from `POST /v1/import/csv`, and the 502s two folder reads can send. `facets` is a documented query parameter at last, and no longer marked required in the answer — `facets=0` leaves it out, which a generated client with a non-optional field could not decode.
- `POST /v1/collection/items/{id}/copies` accepts the empty body its own description promises. An empty body reached `JSON.parse("")`, which throws, so the documented way to ask for one more identical copy was the one way that was refused; `{}` always worked and still does.
- Two store reads that could throw past their route — the folder lookup on `/v1/value-history` and the profile read on `GET /v1/profile` — answer `{ error: string }` at a documented status instead of Next's generic 500.

## 2026-09-10

- `GET /v1/cards/{tcgId}?language=ja|zh-tw|zh-cn|ko` reads the card from that catalogue. These ids exist only there, so without it a card added from one of those shelves had no detail to open. `languages` comes back empty for such a card: the Western catalogues share the English ids, so a copy of it can only be its own language.

- A set in the collection says which catalogue its cards came from (`CardSet.language`, null for English), and a card from another one carries that in its `key`. A collector who holds Black Bolt in both keeps two sets rather than one set whose halves overwrite each other's pictures and prices.

- A card from the Japanese, Korean or Chinese catalogue can be added and looks right. `POST /v1/cards` takes `tcgId`, the catalogue's own id for the printing; with a `language` of `ja`, `ko` or `zh` the collection resolves that card against its own catalogue by id — picture, rarity, set, release date and Cardmarket's euros — instead of by number within a set found by English name, which no Japanese set has.

- A copy keeps what its foil looks like. `foilPattern` was accepted by both copy routes and
  written by neither: `columnsFor` never mapped it, `copyRow` never inherited it from the source,
  and `split_card` predates the column entirely. The API answered 201 and the pattern was gone.

- Changing your password really does ask for the current one now. `POST /v1/password` only passed `current_password` to Supabase when the request happened to carry it, so a session that left the field out changed the password without it — which is the borrowed unlocked browser the check was written for. The route reads the session's own `amr` claim instead: a session that ever signed in with a password must supply it, and a session that arrived through a reset link, which never had one, still does not. A signed-in request without it is a 400, "Enter your current password."

- `createRows` no longer claims a CSV import is idempotent. It never was: the conflict target
  names a `source_id` a CSV row does not carry, and in Postgres every null is distinct. Writing
  the file twice writes every card twice, which is deliberate and argued where the decision
  actually lives — the comment was the part that was wrong.
- A refused `imports` row is logged instead of discarded, so an import can no longer run with no
  record that it started.

- Fixed one failed set costing every later set its second price source for ten minutes. A single pokemontcg.io hiccup put the whole instance quiet, and the nightly snapshot always runs on a cold one with no earlier answers to fall back on — so the rest of that run was priced on Cardmarket alone, recording every card over €20 about 12% high in a history that is permanent. The quiet period is now per set, and only goes site-wide once three sets in a row have failed, which is what an outage actually looks like.

- Fixed the value chart being able to step by around 12% with nothing to explain it. `scripts/snapshot-collection-value.mjs` upserted into the same `(user_id, snapshot_date)` row the nightly cron writes, but priced from Cardmarket's guide alone where the cron blends Cardmarket and TCGplayer — on a €100 card, €127.50 against €113.75. The script now reports its readings and records none; the cron owns that table. Recording an archived reading again would need a column saying which basis it was taken on, since the second market has no history for those days to blend against.
- Fixed a Poké Ball or Master Ball copy being valued at the plain printing's price by that script while every other valuation path used the foil price, which runs at a median of twice as much. The rule for which price series a copy reads now has one definition, in `lib/core/price-basis.mjs`, and `collection-row.ts` re-exports it.
- Fixed `snapshot-collection-value.mjs`, `cardmarket-links.mjs` and `backfill-finish.mjs` looking for their cached data under `lib/core/` after it moved to `src/lib/core/`. The first re-resolved all 1,553 Cardmarket ids from TCGdex on every run and then died with `ENOENT` before keeping any of them; the other two could not start.

- Browsing a Japanese, Korean or Chinese set shows what you own of it. The marks are joined on the card's own catalogue id, so they are exact — and a card from one of those catalogues no longer counts towards the English set it happens to be named after.

- `GET /v1/public/{username}/collection` now reads the owner's `wishlistPublic` flag, as its sibling `GET /v1/public/{username}/cards` already did. A card with no owned variant is a wish, and this route sent them to anybody whatever the flag said; with the wishlist off they are left out, and a set holding nothing else goes with them.

- The reserved usernames — `admin`, `support`, `security`, `cardorb` and the rest — hold at signup too. `handle_new_user()` took the name out of the caller's own signup metadata and never consulted the list, so a signup made straight against Supabase with the public anon key, rather than through this API's signup route, could take one. A reserved name now falls through to the generated `u…` name, the way a signup with no name at all already did.

## 2026-09-08

- `GET /v1/public/species` answers every National Pokédex number and its name, with no key and no username: a signed-out visitor's Pokédex tab on a public profile said "No cards found" because the only route carrying those names, `GET /v1/pokedex`, also carries the caller's own counts and rightly refuses a stranger.

- Removing a card now answers with the row it removed, in the same shape a change to one answers with, and `POST /v1/cards` accepts the date a card was got (`acquiredAt`) — so a client can offer Undo on a removal and put the card back exactly as it was, acquired date included, rather than as a card pulled today. Nothing is kept on the server for it: a removal is still a removal, no read changed, and a card gone from one client is gone in the other.

## 2026-09-07

- The TCGdex id a browse card is matched to is covered by tests, so the price keyed to it cannot go missing the way it did in #241 without something failing.

- A note for the next person: adding a field to something cached means bumping that cache's version, or the old entry stands for its whole TTL. Written down after it cost a day of set codes.

- A card in `GET /v1/cards` says whether it is `excluded`: kept out of the public profile and the latest pull. `PATCH /v1/collection/items/{id}` has taken the flag all along; a client could set it but never read it back, so no screen could show what it had set.

- `GET /v1/cards` filters by `gen` and `type`, each one whole and case-insensitively, as `set` and `rarity` do. The response's facets carry `gens` (in the collection's own, chronological order) and `types` (A to Z) beside the sets and rarities, so a filter menu is built from one read.

- A row's copies can differ: `POST /v1/collection/items/{id}/copies` adds one more copy as a row of its own, `POST /v1/collection/items/{id}/split` moves some of a row's copies to a row with their own language, condition, grade, finish, folder, price or acquired date. `GET /v1/cards` takes `number` beside `set`; a new card can be filed in a folder at once (`collectionId` on the draft); PATCH takes `acquiredAt`.

- A CSV export can be imported into your collection, and an export from Dex is recognised on sight: its copy counts, its printings and its wishlist all come across, and the thousands of checklist lines for cards you do not own are left where they are. Every import shows you what it would do — including how many of the cards you already have — before it does anything.

- A card imported from an export now keeps its foil where the export names a pattern for it — Cosmos, Cracked Ice, Starlight, Confetti and Vertical Line all arrive as holo instead of arriving as nothing. A Play! Pokémon "Master Ball League" promo is no longer filed as the Master Ball reverse from 151, which was reading the wrong price.

- A copy's `finish` can be `poke-ball` or `master-ball`: the patterned reverse holos of 151 and Prismatic Evolutions. Both are priced as a reverse holo (the foil price where Cardmarket publishes one). Readers with a closed list of finishes must add the two before a copy carries them.

- The foil-pattern migration carries the version the database recorded when it was applied. The file and the history had two different timestamps for one change, which is enough to make `supabase db push` refuse every migration after it.

- The foil's pattern can be set when you add a card and changed afterwards, like the printing: one card is commonly held both as a patterned holo and as a plain one, and 115 in a real collection are.

- A copy can record what its foil looks like — cosmos, cracked ice, starlight, confetti or vertical line — beside what it is worth. An import keeps the pattern where the file names one; it is not shown on a public profile, for the same reason the printing is not.

- An import now adds every card in the file, including ones you already have — a second copy is a normal thing to own. The preview says how many of them you already hold, so importing the same file twice is something you see coming.

- The import's "you already have these" count is read in pages. Unpaged, PostgREST capped it at a thousand rows and said so by handing over a thousand rows, so a collection larger than that under-counted what it held — and that count is the only thing standing between a person and a doubled collection.
- Two cache keys carry a version they were missing: set-catalogue is v4 (its contents changed when the promo aliases and the set-id rule did) and collection-rows is v2 (it gained foilPattern). A fix behind an unbumped key does nothing for the whole TTL.
- A set's price budget clears its own timer, so a rebuild no longer writes a "gave up" line for every set that answered in time. The budget is checked for being a number.
- BrowseCard's `series` may be null in the contract, which is what every route that builds it has always sent.

- An import tells apart the cards a file says you do not own from the rows it could not read. Most of an export from Dex is the first kind — the checklist of everything a set contains — and reporting those as unusable made a working import look half broken.

- A card held four times is one line of four, not four lines. The card list returned an item per stored row, so four copies agreeing on language, finish, condition, grade and folder drew four identical tiles — and paging, totals and the counts under a title all treated them as four different things. Grouped where the list is built, so the numbers describe what is on screen.

- This repository installs with pnpm, like the web one. Same package manager, same lockfile format, same CI shape in both — so a shared package between them later is a move rather than a migration.

- Asking pokemontcg.io for a set's dollar prices is bounded at eight seconds, all pages and retries together. Four pages at two attempts and twelve seconds each meant one set could take ninety-seven seconds, twice that with a gallery, and the ten-minute brake only came on once that had been paid — which is what made a collection look like it had hung while that host was unwell.

- A card's price line goes back to November 2022 where the American market has it: `GET /v1/cards/{tcgId}/prices` answers every reading a card has, not the last ninety days. The years before the nightly Cardmarket reading (2026-08-16) come from TCGplayer, turned into euros at each day's ECB rate: the market price from tcgcsv.com's archive, weekly from February 2024, and before that weekly averages of TCGplayer sales from tcgdex/price-history for the older sets. `card_prices.source` says which; `scripts/backfill-card-prices.mjs` fills it in and can be rerun.

- The second catalogue's scan of a promo is found under the number that catalogue uses. It writes "SM191" or "SWSH282" where the collection keeps the digits printed on the card, so the address built from the row's own number was a 404 and thirteen promos here — the tag-team GX ones, the Galarian birds — kept an empty square while the picture sat one name away. The bare number is still tried first, and a picture is only used when the name at that number agrees with the row's.

- The second catalogue's card list is read to the end. It hands out 250 cards at a time and SWSH Black Star Promos has 304, so the Galarian birds (SWSH282–284) sat outside the one page that was asked for, which reads exactly like a card that host does not have. With the set-facts key bumped alongside, a fix to a picture is seen today rather than tomorrow.

- A public collection can be sorted `added`: newest first, by the day each card was got. The dates stay off the wire — the list is built in that order and hands out the same fields as before — and a card nobody dated goes last.

- A set carries the code printed on its cards — MEW for 151, SFA for Shrouded Fable — so a card can be labelled with the three letters a collector reads off it instead of a whole set name.

- Two more set names the collection and pokemontcg.io disagree on: "Set 1 Unlimited" (and its shadowless and unqualified siblings) is that catalogue's "Base", and "Scarlet & Violet Base" is its "Scarlet & Violet". Until now a card in either set was unmatched wherever the two vocabularies meet — unowned in the catalogue search, missing from a set's progress on Browse — which in the one collection here is 132 cards, a Base Set Charizard among them.

- The set-facts cache key moves to v13. Yesterday's answer for a card's picture is a day old by design, so the two scan fixes shipped alongside it would not have been seen until tomorrow — fourteen cards here would have kept an empty square through the deploy that fixed them.

- Set codes reach the collection. #238 added the code printed on a set's cards but left the set-facts cache key at v14, so every entry cached before it deployed was a set without one, and the card tiles wrote their set out in full for a day. v15.

- A set's cards carry a price. `GET /catalog/sets/{setId}` puts Cardmarket's number on every card of the page it returns, from the guide already cached for the day and with no per-card fallback behind it, so a set can be read the way the collection's own lists are rather than as a checklist.

- The prices #241 put on a set's cards were always null: they were looked up by pokemontcg.io's id (`me5-85`) while everything priced here is keyed by TCGdex's (`me05-085`). The match was already being made for the artwork, so the id travels with it now.

- A scan path the assembly works out for itself is checked before it is used. TCGdex lists a gallery subset's cards without an `image` while the files do exist under the parent set, so the path is built rather than given up on — but it also lists cards it has no scan of at all, and there the built path is a 404 that looked like artwork and kept the Limitless and pokemontcg.io fallbacks from ever running. Fourteen cards in the collection here showed an empty square for that reason, the tag-team GX promos among them.

- Cards from an EX Trainer Kit deck now find their scan and price: the catalogue files those sets under the deck's Pokémon, and an export names the product.

## 2026-09-06

- An instance keeps the collection it assembled for ten minutes, by the rows' version, so the screens that read it together (`/folders`, `/stats`, `/cards`, a Pokédex) pay the join once; a card's species is looked up once per name; `facets=0` on `/v1/cards` skips the facets pass.

- The nightly reading values every card at the price the app shows (Cardmarket, TCGplayer where Cardmarket has nothing), so the value lines end where today's number stands.

- A copy has a language (`language`: en, de, fr, it, es, pt, nl, ja, ko, zh, or null for not recorded) on every card shape, settable on add and on PATCH.

- `GET /v1/cards/{tcgId}` says which Western languages the card was printed in (`languages`), asked of each catalogue; a copy can be one of those and no other.

- `GET /v1/cards/{tcgId}/prices` gives one card's price day by day over the last ninety days.

- Card price history is read in pages, so a series over more than a thousand readings no longer stops early (a folder's value line, the movers).

- A card's price history is its own again: the cached reading is keyed by the cards asked for, so one card's line no longer comes back as the whole collection's.

- Two Cardmarket products TCGdex does not link are set by hand: the Wizards Black Star Promo Pikachu (#1) and Ancient Mew, so both are priced from the guide.

- `scripts/cardmarket-ids-fill.mjs` links the Cardmarket products TCGdex does not, from Cardmarket's product list; eleven Wizards promos linked with it.

- The shelf and a set page can be asked for another language's catalogue: `GET /v1/catalog/sets?language=ja|zh-tw|zh-cn|ko` and `GET /v1/catalog/sets/{id}?language=` read TCGdex's Japanese, Chinese and Korean catalogues, with their own ids, names and scans.

- A warm-up cron every ten minutes assembles every account's collection, so the first read after a deploy is paid on nobody's screen.

- The value-over-time series can be asked for one folder or the favorites (`GET /v1/value-history?folder=`), built from the daily card prices.

- Japanese sets are named in English where a translation is known (`name`), with the Japanese name beside it (`localName`).

- A set of another language shows no picture again until a logo exists for it; the first card stood in and read as the wrong thing.

- An owner's `/v1/cards` page can be 2,000 long, so a Pokédex reads the whole collection in one request rather than four; a public page stays at 500.

- A Pokédex setting can name `kinds` of card (V, ex, GX, …) beside `rarities`, for what a rarity cannot tell apart: a full-art V and a full-art ex are both Ultra Rare.

- An unreadable pokemontcg.io index is no longer cached for a day as "nothing to price"; a set's gallery cards get their TCGplayer price too; a card one market prices keeps that market's shape; "SV01" and "SV1" are one number.

- Fourteen more promos linked to their Cardmarket product by hand: the Wizards Black Star Promos 2 to 22 (their product ids run in number order), the three Galarian birds and Darmanitan Black Bolt 014.

- TCGplayer's price finds a promo whose number it prefixes (SWSH282, XY150a) from the collection's plain number.

- A public item's `favorite` is read off the owner's copy, so `list=favorites` lists the starred cards rather than nothing; unset for everyone whose favorites are not shown.

- The favorites and the Pokédex can show on the public profile, each behind its own flag (`favoritesPublic`, `pokedexPublic` on the profile); `GET /v1/public/{username}/cards` takes `list=favorites` and `list=pokedex`, a public item says whether it is a favorite, and the public profile carries the owner's Pokédex setting while the Pokédex is shown.

- The dollar rate is read from frankfurter's new host, and a failed read is not cached: a null kept for a day was a day without TCGplayer prices.

- Set facts rebuilt once, so the two products set by hand price their cards today rather than tomorrow.

- The twelve SM tag-team promos and Fennekin MEP 080 linked to their Cardmarket products by hand; every card in the collection now has one.

- A card TCGdex is asked about carries TCGplayer's dollars too, so a promo Cardmarket does not price gets its second price from TCGdex when pokemontcg.io has none or is down.

- TCGplayer's prices live in a day-long cache of their own per set, blended into the set's facts on read; a failed pokemontcg.io call is not cached, so an outage costs the second price for minutes, not a day.

- While pokemontcg.io is down, a set keeps the TCGplayer prices it last got on that instance rather than showing its cards unpriced for the quiet minutes.

- `GET /v1/value-history?folder=wishlist` gives what the wishlist would have cost, day by day.

- Yveltal-EX XY150a is linked to its Cardmarket product by hand, the last card the guide could price and did not.

## 2026-09-05

- Starring a card, changing how many you hold or adding a note no longer makes the next screen wait for the whole collection to be matched and priced again: what the catalogue says about each card is kept per set for a day, and only your own rows are read afresh.

- Making a folder no longer drops the assembled collection from the cache, only the folder
  list: a new folder changes no card, and the rebuild cost every read after it twenty seconds
  on a large binder. Deleting a folder still drops both, since that unfiles cards.

- `GET /v1/cards` says what the list is worth: `value` and `unpriced`, over the whole filtered
  list rather than the page, and a wishlist's facets now name its own sets and rarities. `sort=dex`
  puts the copies in national Pokédex order, trainers and energy last. A folder may be shown as a
  Pokédex: `pokedex` on `POST /v1/folders` and `PATCH /v1/folders/{id}` takes whether the missing
  Pokémon show and the range collected, `null` turns it off; the built-in Pokédex takes the same
  setting from `PATCH /v1/profile { pokedex }`.

- A Pokédex setting can name `rarities`: only cards of those rarities fill the slots, for a Pokédex of full-art cards. On the profile's setting and on any folder shown as a Pokédex.

- A card Cardmarket has only a lowest listing for shows that listing as its price, rather than no price; the collection's value counts it.

- `GET /v1/cards?priced=false` lists the copies nothing prices, the ones the collection value leaves out; `priced=true` the rest.

- A folder can be shown on your public profile: `isPublic` on `POST` and `PATCH /v1/folders`, off by default. `GET /v1/public/{username}/folders` lists the ones you show, with how many cards each holds, and `GET /v1/public/{username}/cards?collection=` narrows the public list to one of them.

- A public card carries `imageHigh`, the larger scan, so a public page draws the same picture the owner sees.

- The wishlist can show on a public profile: `wishlistPublic` on `PATCH /v1/profile`, off by default, read back on the profile and on `GET /v1/public/{username}/profile`; `GET /v1/public/{username}/cards?list=wishlist` lists the cards the owner is looking for.

- Three answers put right after review. `GET /v1/cards?collection=` on a rule folder now
  keeps its matches when `owned=false` is also given, as the contract said. A folder body may
  be 8 kB, so a rule with twenty sets and twenty rarities is no longer refused as too large.
  `GET /v1/folders` carries `catalogueUnavailable` during a TCGdex outage, when a rule
  folder's `count` is low for want of Pokédex numbers and set titles.

- A folder may now carry a rule and fill itself: `rule` on `POST /v1/folders` and
  `PATCH /v1/folders/{id}` takes a Pokédex range (`dex.from`–`dex.to`), sets and rarities, AND
  between the fields and OR within a list, and the folder then shows every owned copy that
  matches. `GET /v1/folders` says each folder's `kind` (`manual` or `rule`) and its `rule`, with
  `count` counting what it holds either way. `GET /v1/cards?collection=` answers a rule folder
  with its matches, and an id that is no folder is a 404 rather than an empty page.
  `PATCH /v1/collection/items/{id}` refuses to file a copy into a rule folder. A folder keeps
  its kind: a manual one cannot be given a rule, and a rule one cannot lose it.

- A card Cardmarket publishes nothing for is priced from TCGplayer, in euros at the day's ECB rate; old promos in a collection count towards its value now.

- TCGplayer's set prices are asked for with a longer wait and three tries, and card by card where the search still fails, so a slow or failing pokemontcg.io no longer leaves a set without its second price for a day.

## 2026-09-04

- The card list (`GET /v1/cards`) now names the sets and rarities you hold beside every page, so a list page no longer has to fetch the whole collection to draw its filter menus.

- The collection survives a TCGdex outage. `GET /v1/cards`, `/v1/collection`, `/v1/stats`, `/v1/pokedex` and the three public routes used to answer 503 for as long as TCGdex was unreachable, which took every page of the web app down with them; they now serve the rows alone, without a scan, a catalogue id or a price, with `catalogueUnavailable: true` beside the answer. Nothing caches an outage answer: the hour-long entry stays empty until TCGdex is back, and the public routes send `no-store` for it.

- A public collection can be narrowed by set or rarity and sorted by name, and its page names every set and rarity it holds, so a visitor can filter someone's collection the way the owner filters their own.

- A public collection's rarity menu names each rarity once, even where the catalogues spell it two ways.

- The set list (`GET /v1/catalog/sets`) counts the distinct cards you own of each set, not copies: a second Charizard no longer reads as one card closer to complete, and `ownedCount` never exceeds `total` (#162).

## 2026-09-03

- `GET /v1/cards` sorts (`sort=set|name|price|added`, `order=asc|desc`) and narrows to one set or one rarity (`set=`, `rarity=`), so a list can be ordered by value or by the day a card came in without fetching the whole collection.

- A catalogue that accepts the connection and never answers is given up after eight seconds instead of holding the request until the platform's limit, so an outage like TCGdex's on 2026-09-02 costs a moment rather than minutes per page.

- The contract and the answers agree, in six places. Every 429 carries `Retry-After`, the whole seconds until one more request is let through. Every 401 says `Sign in first.`; `authorise()` used to say `Sign in to see this.`. The three catalogue routes answer `The catalogue did not answer. Try again in a moment.` at 502 instead of the slugs `catalog-unavailable` and `search-unavailable`. `GET /v1/folders` carries `collectionUnavailable: true` when the store could not be read, so `count: 0` on every folder is not mistaken for empty binders, and the four folder operations list their 502. `POST /v1/collection` refuses an unknown `finish` with a 400 like `PATCH` does, where it used to turn it into null. `GET /v1/cards` documents `limit` and `offset`; `GET /v1/profile`, `GET /v1/imports`, `GET /v1/collection` and `GET /v1/cards/{tcgId}` carry the read headers on every answer, refusals included, so a browser on an allowed origin can read a 401, 429 or 503.

- Five answers put right. `PATCH` and `DELETE /v1/collection/items/{id}` say `404 No such card.` for a copy that is not there or not yours, where they used to answer 502 or a hollow `ok`. A store failure answers one fixed sentence per operation instead of the database's own words, and a deployment with no database answers the documented 503. `GET /v1/cards/{tcgId}` and `GET /v1/public/{username}/cards/{tcgId}` answer 503, uncached, when TCGdex is down, and 404 only for a card it does not have. Sorting `GET /v1/cards` by price values a holo copy at the plain price, as every other figure already did. The four public routes are cached at the CDN for a minute and never served stale, so a profile turned private is gone within that minute rather than up to an hour later.

- `GET /v1/stats` says what the collection is worth today (`value`, in euros) and how many copies carry no price (`unpriced`), so a dashboard can show the figure without adding up pages.

## 2026-09-02

- The API now has a contract and a home of its own. `openapi.yaml` describes every
  route under `/api/v1`, a plain-HTML reference is at `/docs/api`, and `api.cardorb.com`
  serves the same API as `/v1/…` once the domain is attached. Every failure answers
  `{ "error": "<sentence>" }`; the one that did not (the health check) now does, and the
  four wordings of "no database" are one.

- `api.cardorb.com` is attached and live, and the README says so: its examples read
  `api.cardorb.com/v1/…` instead of `cardorb.com/api/v1/…`, which since 2026-09-02 answers
  from the new web app's own API. The npm package is `cardorb-api`, so deployment URLs stop
  being named `cardorb-<hash>`.

- The API grew what the web app needs to stop reading the database itself: `GET /v1/cards`
  answers one page of the collection as a flat list (search, wishlist, favourites, folder,
  paging), `GET /v1/stats` the dashboard's numbers, `GET /v1/pokedex` the 1,025 slots with a
  count and a picture each, and `/v1/folders` makes, renames and deletes the folders a person
  sorts cards into. A copy now carries `collectionId`, and `PATCH /v1/collection/items/{id}`
  files it. Everything under `/v1` that existed keeps its shape.

- The web tool is gone from this repository, and with it every page: the signed-in
  screens, login and signup, the public profile, the marketing and legal pages, the
  brand page and the rendered API reference. cardorb.com is `bartdunweg/cardorb-web`
  now, and that is where the reference will be rebuilt, in the same theme as the rest
  of the site, from `/openapi.yaml` on this host. Until then `api.cardorb.com/` answers
  with the contract itself. Nothing under `/v1` changed.

- A set whose records TCGdex could not deliver is no longer remembered as empty for a day: the API asks again on the next request, so a short outage at TCGdex costs a moment rather than a day of cards without pictures.
- `GET /v1/public/<username>/cards` also says how many sets the collection spans, so a profile page can show that without fetching the whole collection.

- A request that carries an account credential is no longer held to ten a minute per address.
  That ceiling was for guessing the old passcode, and the web app's servers make requests for
  every visitor from a handful of shared addresses; they are held to six hundred a minute now,
  and a request with nothing to show is still held to ten.

- A collection that could not be built — the store or the card catalogue unreachable — is
  a 503 nothing caches, on every route that reads it. It used to be an empty 200 that the
  cache kept for an hour, and the catalogue half was kept for a day: one 404 from TCGdex's
  set index during a build left every card without a picture, a price or an id for every
  app at once.

- Every failure under `/v1` is written by one helper now. The 140 hand-typed `{ error }`
  answers across 31 route files were rewritten to `apiError()`; nothing a client sees changed.

- The shared passcode (`CARDS_TOKEN`, the `x-cards-key` header) is gone. Every caller is an
  account now: a Supabase access token as bearer, or the session cookie on this origin. No
  client of ours sent it any more; a request that still does is refused like any other
  unsigned request.

- A card's price comes from Cardmarket's own price guide now — one file, read once a day —
  instead of one TCGdex request per card. A cold build of the collection used to take minutes,
  during which the first visitor after a deploy waited or gave up; it takes seconds. TCGdex is
  asked only for a card the guide does not know yet, and the numbers agree with the nightly
  snapshot to the cent.

- `GET /v1/public/<username>/cards` answers one page of a public collection as a flat list —
  `q`, `limit`, `offset` — one entry per card with its copy count, nothing private, for a page
  that shows a hundred cards without fetching nineteen hundred.

- `GET /v1/public/<username>/profile` answers the name to print and the picture, so a page
  can draw a public collection's header without a key. No prices, no email, same limiter and
  cache as its two siblings.

- A public profile's collection is read again. The anonymous role may read only the public
  columns of `cards` since the web app's schema review, and the three public routes read the
  whole row as anonymous, so they answered every visitor with an empty collection — cached at
  the CDN for an hour. They read as the service role now, scoped to the one public profile, and
  a failed read is a 503 nothing caches rather than an empty 200.

- `api.cardorb.com/` sends a visitor to the reference again: the web app draws it from this
  contract at cardorb.com/docs/api, in the site's own theme.

## 2026-08-23

- You can now remove your profile picture, not only replace it — a Remove button sits beside Change, and it clears the picture from your profile and the public page.
- Deleting your account now opens a confirmation dialog that asks for your password again, and that password is checked on the server before anything is removed — so a signed-in session left open cannot end the account in one click.

- The Settings screen is rebuilt on Untitled UI's two-column layout: each section — Profile, Account, Import, Appearance, and delete — shows its title and a one-line description in a column on the left, with the fields in a card on the right, divided from the next section.
- Every field now has a visible label, the Save button sits next to the field it saves, and the light/dark picker is a segmented control.
- The page opens with a short description of what Settings is, rather than printing your email address at the top.
- Control edges — the borders on inputs and buttons across the whole app — are lighter, matching Untitled UI's own softer edge.

- Each group on the Settings screen now carries a short description under its heading and a divider between groups, so Profile, Account, Import, Appearance and "Delete this account" read as clear, separate blocks.
- On the Appearance picker, the mode you have chosen is now marked with a checkmark, not by colour alone.
- Saving a setting — and any error — is now announced to screen readers instead of appearing silently.

## 2026-08-22

- Request size limits now count bytes rather than characters. Anything you sent
  with accents or non-Latin script was measured short, so a field capped at
  4 kB accepted up to twice that. Nothing you can do in the app came near either
  number; this closes the gap rather than fixes a symptom.

- Buttons, search fields and segmented controls are now capsules rather than
  rounded rectangles, with a little more room at their ends. The old rectangle
  shape is still available and unchanged, for the places that ask for it.

- Every card in your collection can now be reached and opened with a keyboard.
  They could not be: each card sat in a wrapper the browser gives no shape to,
  and a shapeless element cannot be focused, so tabbing through the page skipped
  all 1,600 of them. Nothing about the page looks different.

**Changing your password now asks for your current one.** Until now a signed-in
browser was enough — so anyone who found your screen unlocked could change your
password, which signs you out of your own account, and go on from there to your
email address and to deleting the account.

Resetting a forgotten password is untouched. If you arrive from a link in a
reset email you are not asked for the old password, because not having it is why
you are there. The screen is the same one either way; it now knows which of the
two brought you.

If you type the wrong current password it says so, instead of telling you the
new one could not be set.

- The dashboard's "By era" and "By type" titles now use the same heading weight and size as every other section heading in the app, instead of a slightly smaller, off-scale one.

- Every dialog and sheet — the card view, Add a card, Filter and View — now runs
  on the same component library as the rest of the app instead of on hand-written
  code of our own. What you should notice: nothing, except that they open and
  close with a slightly different movement.
- Filter and View on a phone can be tabbed through with a keyboard again. They
  used to trap you: once you were in, no key got you out, which also affected
  anyone using a desktop at 200% zoom.
- Opening a card from halfway down your collection still leaves the page exactly
  where it was, and the bar along the bottom no longer flinches as a dialog opens.

- The collection, the dashboard and public profiles now sit on the same page background as the rest of the site, so the sidebar, the set panels and the card hover all stand out against it instead of blending in.
- The fade behind the mobile tab bar no longer ends in a visible band in dark mode.
- The browser's own top and bottom bars are tinted the colour of the page again, closing a seam that showed on iPhone.

- A page that fails outside the signed-in area — the homepage, a shared profile link, the legal pages, the sign-in screens — now shows Card Orb's own error page with a way back and a reference code, instead of the browser's blank default.

### Changed

- The Set and Type fields in "Add a card" now use a real suggestion list instead
  of the browser's own. The suggestions open on focus, are announced properly by
  a screen reader, and typing something that is not on the list still works —
  so a card from a set the catalogue has not indexed yet can still be filtered
  for.

### Changed

- The styling is rebuilt on three layers — `styles/theme.css` (tokens),
  `styles/globals.css` (base) and `styles/app.css` — with `theme.css` as the
  only place any design value is written down. Untitled UI's palette is taken
  name-for-name and its light and dark halves are folded into one `light-dark()`
  declaration per colour, so no colour exists twice. Shipped CSS drops from
  205 kB to 179 kB.
- Body and secondary text are slightly darker in light mode (`#111111` →
  `#171717`, `#666666` → `#404040`), because Card Orb's label colours now point
  at Untitled UI's text tokens instead of being written out separately. Higher
  contrast, not lower.

- Every tab in the mobile tab bar is now the same width — the width of the widest one — so the "You" tab no longer sits narrower than the rest.
- The add button has moved out of the mobile tab bar and onto the dashboard, beside its heading, which is what makes room for the tabs to be equal. Adding a card from a phone starts on the dashboard for now.

- Pointing at a card no longer makes it flash before it tilts. The effect used to be
  put on screen a moment before the code that draws it had arrived.
- A card whose picture failed once and recovered keeps the picture it recovered with,
  instead of losing it again the first time you point at it.

- Signed-in screens now show the Card Orb mark while they load, instead of a grey outline of a page that was not the one you were opening. It fades in only if the wait is long enough to notice.

- The "Value over time" chart on the dashboard now has a real X and Y axis with readable, rounded euro values, faint horizontal gridlines and no dots on the line — a dot appears only where you point. It is drawn in the brand colour and is taller.
- The chart's dates are spaced by how far apart the readings actually are, so a long gap in the record looks like a long gap instead of a single step.
- Your collection's value is now recorded once a night instead of once a week, so the chart fills in roughly seven times faster from here on.

## 2026-08-21

- The search box in "Add a card" is now the same size as every other field in the app. It was rendering at half again the size, and anything you typed into it came out oversized and bold.

- Adding a card no longer asks you to type the generation. It comes from the card itself, like the rarity and the type already did — so the only things left to answer are whether you own it and whether to keep it out of the latest pull.
- Cards filed under "X&Y" now say "XY", matching every other era name, so the era filter lists one entry per era instead of two spellings of the same one.

- The brand page shows the Card Orb wordmark again in dark mode. It was drawn in near-white on a white panel, so the name was invisible on the one page whose job is showing how the name is used.
- "How it works" in the landing page's menu now goes to the How it works section. It went to Features.

- The collection screens are drawn entirely from the shared design system now, with no stylesheet of their own.

- The View and Filter buttons, the grouping tracks and the close button all wear the same surface as every other control in the app, instead of a separate glass recipe that only they used.

- When the collection cannot be loaded, the dashboard now says so instead of showing "0 cards, €0" as though the collection were empty.

- The filter and view panels on a phone can be used with a keyboard again. Opening one used to leave the keyboard stuck outside it, so none of the options could be reached — only Escape worked.

- Text sizes no longer stretch with the width of the window. Every size is one of a fixed set now, so a heading is the same size on a laptop as on a large monitor.

- A public collection page now downloads about 120 kB less: a charting library was being sent to five screens that never draw a chart.

- The public card lookup, the CSV import and the avatar upload are now rate limited, like every other endpoint already was. Nobody using the app normally will meet these limits.
- Checking whether a username is free now only answers this site's own sign-up form, not a script running on someone else's page.
- An avatar upload is now checked against the actual file, not just what the upload claims it is.

- The buttons and the badge on the landing and iPhone pages are the same components as everywhere else in the app, rather than look-alikes assembled by hand.

The app draws from one icon set instead of two. Every icon is Untitled UI's now
and `lucide-react` is gone, so the chrome and the components it sits beside are
drawn by the same hand. Icons look slightly different as a result — a different
grid and a different weight — and two of them changed on purpose: the **View**
button wears sliders rather than a gear, and **Browse** is a navigational
compass rather than a drafting one.

Buttons that only looked like buttons are buttons. Ten of them — in Settings,
the sidebar, the import screen and the collection toolbar — were plain elements
painted to match; they are the real component now, which is what makes them
behave the same everywhere for a keyboard and a screen reader.

Card tags are the design system's badge, so a card takes a little less room and
rows sit closer together. A held printing is filled and a wanted one is
outlined, the same distinction as before and still readable without colour.

- Card Orb now draws from Untitled UI's full icon set, which adds filled, duocolor and duotone styles alongside the outlines it already used.

- Sharing the iPhone app's page now shows a picture and a title instead of a bare link. It had been shipping with no share image at all.
- The share cards for the privacy policy and the terms of use now carry their size and description, so chat apps and social sites draw the large version rather than a thumbnail.
- The home page's browser tab and search result now read "Card Orb — track your Pokémon card collection" instead of just "Card Orb".

**"Skip to content" now skips the navigation.** It is the first thing a keyboard
reaches on any page, and it was landing at the top of a region that still had
the sidebar and the tab bar inside it — so pressing it moved you past one bar and
then straight into the whole menu anyway. On every screen, the first thing after
it was the Card Orb link in the corner.

It now lands where the page's own content starts: the search field on your
collection, the first line of a legal page, the first link on the home page.

Nothing looks different. A skip link is invisible until you focus it, which is
why this went unnoticed for as long as it did.

- Active items in the sidebar and the mobile tab bar now use properly drawn solid icons instead of outline icons with their fill turned on.

The last eight buttons that only looked like buttons are buttons. The **Filter**
and **View** controls on a phone, the Cancel, Apply and Done inside those sheets,
the arrows either side of a card on a shared collection link, and the avatar's
**Upload** — all were plain elements painted to match. They are the real
component now, so they focus, disable and respond the same way as every other
button in the app.

Almost nothing changes on screen. **Filter**, **View** and the avatar's button
are four pixels wider, because they now carry the same spacing around their
label as every other button that has one. The only other difference shows while
an avatar is uploading: that button fades by the same amount as anything else
unavailable, rather than by its own slightly different one.

Nothing on screen changes with this one. It is the scaffolding underneath: the
design system's button styling is now read from the component that defines it
rather than kept as a second copy, the code that ships with the design system is
type-checked instead of exempted, and the screenshot tests can no longer report
themselves green without actually comparing anything.

That last one had been hiding a real fault in code that had never been checked —
an import of a package the project does not have. It is fixed.

- On a tablet-sized screen the collection's toolbar wraps again: the search field takes its own row and View and Filter sit under it, instead of four controls squeezing onto one line.

- Three empty messages — the sets list, the set browser, and a set you have every card of — were rendering as unstyled text. They are proper empty states again, with an icon and a line explaining what to do.
- The number of active filters beside the Filter button was showing as bare text instead of a badge. It is a badge again.
- Filter and View open as proper panels now: they close on Escape and on a click outside, and they hand focus back to the button you opened them from.
- The switches, the segmented rows and every text field are built from the shared component set. The chosen option in a segmented row is filled in rather than tinted, so it is legible at a glance.
- The "Add a card" button now shows its label when you reach it with the keyboard, not only when you point at it with a mouse.

- The value chart now has a tooltip: point at the line and it says what the collection was worth on that date.
- Avatars, checkboxes, the priciest-cards table and the appearance picker are built from the shared component set, so they behave the same everywhere — the appearance picker answers to the arrow keys for the first time.

## 2026-08-19

- The mark panels and colour swatches on `/brand` have their rounded corners
  back. They were drawn square, because both read a design token that has never
  existed and a missing token fails silently.
- Body paragraphs on the landing page and the iPhone app page are set a little
  more openly: `leading-relaxed` now means what the design system's own token
  has always said it means, rather than a slightly tighter value it picked up by
  accident.

- Buttons, the active tab and every other "this is the main thing" surface are now Card Orb blue instead of near-black, so the accent means one thing throughout the app.

- The tickboxes in the filter and view menus match the rest of the app now, and the search field looks like the buttons beside it.

- Card Orb's accent colour is now Untitled UI's, so buttons, the active tab and every highlighted surface changed from blue to purple.

- Settings uses the same panels, fields and switches as the rest of the app — one look throughout instead of a page with its own.

- Cards across the app — the dashboard tiles, the value chart, the landing page's feature grid — sit on a plain white surface with a soft edge instead of the frosted-glass panel.

- The bar along the bottom on a phone is built from the same surface and type as the rest of the app now. It works exactly as it did.

- Sign-up, password reset and the welcome flow use the same rebuilt fields as sign-in: labels tied to their input, hints that screen readers announce, and a reveal toggle on every password box.

- The sign-in screen's fields and button are rebuilt on Untitled UI. The password box now has a reveal toggle, so you can check what you typed, and the sign-in button's blue is a shade deeper — the old one put white text at 4.02:1, under the 4.5:1 that small text needs to stay readable.

## 2026-08-17

- Nothing visible changed: twelve classes moved from a stylesheet into the
  components that use them, verified pixel-identical at three widths.

- Signed in, the public pages' navbar shows you as a pill: your avatar and your name inside a light grey rounded button, where it used to read "Signed in as {name}" as a bare line of text. It still goes to the dashboard, and a screen reader still hears "Signed in as {name} — open dashboard". A long display name now ellipsizes inside the pill instead of pushing the wordmark onto two lines on a phone. One component (`app/components/ViewerPill.tsx`) for both `/` and `/app/ios`, which had a copy each.

## 2026-08-16

- Add a card: when the card search can't reach pokemontcg.io, the dialog now says "Search is temporarily unavailable" with a "Try again" button, instead of silently showing no results. A "Show more results" button also appears under broad searches (like a common Pokémon name) instead of stopping at 20.

- Add a card: the search bar's placeholder now says "Search for a card" instead of a list of example queries.

- Browse every set there is, not just the ones you own from. A new **Browse** screen (`/collection/browse`) lists all 174 sets in the catalogue with a search box and how far into each one you are, and opening a set shows every card in it — the ones you have at full strength, the ones you don't dimmed, with an Add button that opens the add dialog already filled in. You can narrow a set to just yours or just what's missing.
- The card search in the add dialog now shows which results you already have, so a second copy is a choice rather than an accident.
- Set pages load about seven times lighter than they first did: card pictures come from TCGdex's WebP where it has them (26 kB) instead of pokemontcg.io's PNG (198 kB), which takes a full 207-card set from roughly 40 MB down to 5 MB.
- New API endpoints for the iOS app: `GET /api/v1/catalog/sets` (every set with your own counts) and `GET /api/v1/catalog/sets/:setId` (a whole set, paged, with `owned`, `wishlist` and `quantity` on each card). Both need a signed-in session or a bearer token, like the existing card search.

- Fixed 21 cards in the collection that were filed under the wrong number or a scrambled name — mostly Trainer Gallery cards, where the numbering had several of them holding each other's places. Each of those cards gets its picture, its price, its own page and its place in the set back; the number is what all four are looked up by. 30 more need a person to look at the actual card (usually "is this the V or the VMAX?") and are listed in `docs/collection-audit-corrections.md`.
- Card names and rarities now say exactly what the catalogue says: 293 cards gained the printing suffix they were missing ("Pikachu" is "Pikachu ex" if that is what is printed on it), and 956 had their rarity and type brought in line. One vocabulary across the whole collection instead of two — which also means the foil effect now recognises 485 illustration rares it previously did not.

- Every collection is now named after the person it belongs to. A shared link reads "Pikachu's Pokémon card collection" for Pikachu's collection, on the page, in the browser tab, and in the preview image — it used to say "Bart's" for everybody.
- Signing up now asks for your name, optionally. Skip it and your collection is named after your username until you fill it in; Settings' "Display name" panel is now "Your name" and shows you exactly what your page will be called.
- Fixed: opening a card from somebody else's public collection answered "no such collection". Only the first account's cards could be opened this way.
- The sitemap now lists every collection that has been made public, instead of only the first one.

- Every card now knows which printing your copy is, worked out from the
  catalogue: 1,904 of 1,968 rows, with 21 left for a human. A reverse holo is
  valued at the reverse holo price, and a card that only ever existed as a holo
  keeps its own.

- A page for the iPhone app, at `/app/ios`. What it is, what it does, what it looks like, and what you need for it — reachable from the landing page's hero badge, its navigation and the footer. `/app` sends you there too.
- The download button on it is deliberately not pressable yet: the app is not on the App Store, and rather than a dead link or a greyed-out mystery it says so in a line underneath. It stays reachable by keyboard so it can explain itself.
- No release date is claimed anywhere on the page, and the screenshots are visibly empty slots until there are real ones to put in them.

- The loading state no longer draws a page that does not exist. While a signed-in screen is on its way you now see the sidebar, the bottom bar and an outline where the heading lands — instead of a toolbar, two set panels and twenty card outlines under a heading reading "Cards", which is what it showed on the dashboard, on settings and everywhere else.
- The bottom bar no longer changes height when a screen finishes loading, and the sidebar's rows no longer jump: its wordmark row and the account button at the bottom are part of the loading state now, so nothing shifts on arrival.
- On a narrow window the bottom bar's outer slots no longer hang outside the bar while a screen is loading; the slots divide the space that is actually there.

- Your dashboard now shows which cards went up and which went down, so the value
  chart's line can be attributed to actual cards. It needs two weekly readings
  before it appears, so it starts showing up about a month after this ships.

- The landing page no longer talks about a demo collection: the FAQ answers questions about your own cards, "Public collections" in the header is now "Sharing", and the "1,600+ cards tracked" figure — one person's binder — is now "No limit, cards per collection".

- Card Orb has a picture of itself. The orb from the iPhone app's icon now sits next to the name in the nav bar, the sidebar and the footer, so the website and the app are recognisably the same product.
- Tabs and bookmarks show the orb instead of the browser's blank page glyph — the round one, with no box around it, since nothing rounds off a favicon for you. Saving the site to a phone's home screen gives it the app icon on its tile, which is what a home screen expects. On Android, Chrome will now offer to install it at all, which it would not do before.
- A link to Card Orb shared in a chat or on social now previews with the orb beside the headline.
- New page at `/brand`: the mark in both its versions, the colours, the rules for using it, and direct downloads. Linked from the footer.

- A card can now record which printing a copy is — normal, reverse holo or holo —
  and a reverse holo is valued at the reverse holo price, which on average is
  about twice the normal one. Nothing is set yet, so no figure changes until the
  finishes are filled in.

- There is a privacy policy now, at `cardorb.com/privacy`, covering both the website and the iPhone app. It says what is stored, why, who else sees it, and how to get rid of it — including that a public collection never shows prices or purchase details, that card scanning happens on your own device, and that deleting your account takes the whole collection with it immediately.
- Every page footer now links to it, and the signup form says so before you create an account.

- A public collection page no longer carries the owner's own inventory. What you
  paid for a card, when you bought it, its condition, its grade, your notes on it
  and how many you hold were being sent to anyone who opened your public link or
  called the public API, even though the page never showed them. Only the rarity
  and whether you own it are published now.

- Settings is one page: Profile, Account, Import and Appearance are all on screen at once, full width like the other screens, instead of four cards you had to open one at a time. Old links such as `/settings/appearance` redirect to it.
- Settings: deleting your account is now its own section at the bottom of the page, rather than a red card in the middle of the Account section.

- Your collection's value is now recorded automatically, once a week, so the
  "Value over time" chart fills in on its own. It used to need a command run by
  hand, which meant it never gained a fourth point.

- The highlight around the selected tab now sits inside the bar on every side.
  On a phone the row of tabs was wider than the bar itself, so the first and last
  tab — and the highlight behind them — hung over its left and right edge, and on
  a narrow phone off the screen entirely. Each tab is as wide as its own label
  now and gives way when there is less room, so the bar always fits, and the
  highlight resizes as it slides between tabs.

- There are terms of use now, at `cardorb.com/terms`, saying what Card Orb promises and what it does not — including, in as many words, that the prices it shows are what a market has been doing rather than a valuation of your cards, and that Card Orb is not connected to The Pokémon Company, Nintendo, Game Freak or Creatures.
- The footer links to both the terms and the privacy policy, the landing page's FAQ answers "What happens to my data?", and the signup form names both before you create an account.

- Changing your username works from a signed-in app, not only from the website. `POST /v1/username` accepted a session cookie and nothing else, so the iOS app was told "Sign in first." while holding a valid token. It now resolves the caller the same way every other write does, and claims the name on that caller's own connection — the same bearer/RLS rule as [0008](../decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md). No visible change on the website.

- The "Value over time" chart on your dashboard is now your own collection's
  history. It used to draw the same series for every account. It stays hidden
  until your collection has been valued at least twice.
- Collection value now counts every copy you hold. A card in the binder three
  times used to be worth one of it, so the figure went up for anyone with
  duplicates. "Priciest cards" still ranks by what one copy is worth.
- `GET /api/v1/value-history` answers with the caller's own series.

- New accounts now start with a short welcome flow: pick your username and display
  name, add a picture, decide whether your collection is public, and either add a
  first card or import a spreadsheet. Every step can be skipped, and everything in
  it stays available under Settings.
- Settings > Profile now says whether a username is free while you type it, the
  same check the welcome flow makes, instead of only after pressing Save.
- An empty collection no longer says the collection is unavailable. A new account
  reads "No cards yet" with a way to add one; the outage message is kept for
  actual outages.

- The wishlist tile on your dashboard now also says what the list would cost to
  buy.
- Collection value now says where it sits against its own 30-day average, so the
  figure has some sense of scale from the first day rather than only once the
  chart has two readings.

## 2026-08-15

- Add a card: the dialog now opens on a single search bar — type a name, number, set, or type ("charizard 151" works too) and matching cards appear live; pick one to fill in Name, Number, Set, Rarity and Type. "Advanced filters" gives Name/Number/Set/Type as their own fields for a more precise search. A card must be found and picked to be added — there is no longer a way to type one in by hand.

- Opening a card from `/collection` now stays inside the app (sidebar and nav still visible) as a real page, instead of landing on the older standalone `/cards/[id]` page. The old address still works for existing links/bookmarks.

- Trainer Gallery and Galarian Gallery cards can now get their artwork from pokemontcg.io, which publishes those galleries as sets of their own addressed by the printed number. The number is checked against that set's card list before the scan is believed, so a row filed under the wrong number keeps its empty slot rather than showing a different Pokémon. Twenty-three owned gallery cards are blank for exactly that reason today; `docs/trainer-gallery-row-corrections.md` lists the row corrections that will bring their artwork, price and detail page back.

- Landing page: hero simplified to a single centred column, sign-in state now reflected in the nav ("Signed in as {name}" with an avatar), stats row and an FAQ section added, no more links to the public collection demo anywhere on the marketing pages or `/login`.
- Landing/login nav is now one shared, sticky component with a light/dark toggle in the footer instead of a floating button.
- Sidebar (`/collection/*`): shadow reduced, wordmark added to the header with the add-card button aligned opposite it (now filled black), the full set list collapsed to a single "Sets" row linking to the existing `/collection/sets` page.
- Fixed: the bottom tab bar was showing on desktop next to the sidebar instead of hiding above 1000px.

- `GET /api/v1/public/[username]/latest-pull` now only ever answers with a card that is actually owned. Wishlist rows were counted as pulls, so the endpoint was announcing a card that had never been bought — and, since a wanted card is usually a just-announced promo no catalogue has a scan for, announcing it without artwork too. The route also gained a 60/minute per-address rate limit and a preflight (`OPTIONS`) handler, and is now documented in the README for anyone embedding it on another site. No API key: it never needed one.

- Profile picture: upload one in Settings > Profile, shown next to your name wherever the app already showed "Signed in as {name}". Falls back to your initial until you set one.

- New public endpoint `GET /api/v1/public/[username]/latest-pull` returns the most recently added, non-excluded card (no price or purchase data), open cross-origin for the portfolio site. Cards marked "excluded" in the add-card dialog are left out.

- Removed the Notion integration entirely — the collection now lives only in Postgres. Settings > Import no longer offers "From Notion"; only a spreadsheet import remains.

- Removed the "Pokémon" tick-list filter from the collection's Filter menu/sheet — the search box already filters by Pokémon name, and now it's the only way to.

- Wishlist card scans no longer render dimmed and greyscale. That styling existed to tell wishlist cards apart from owned ones when both appeared mixed in the same view; the wishlist now has its own page, so the distinction is no longer needed.

- Full security review of the platform. Closed three gaps: `GET /api/v1/public/[username]/collection` now has the same per-address rate limit as `latest-pull`, the `email` and `password` account-settings endpoints now have one too, and the import-history endpoint now filters by the caller's own id in the query itself instead of relying solely on Postgres row-level security. No other issues found.

- Site-wide: one typeface (Inter) instead of Satoshi for headings and Inter for body text; the page background is now white instead of off-white in light mode.

- Sorting (By set / Priciest / Cheapest) moved from its own toolbar control into the View button, alongside Group by, Layout, Show on card and Per row. No change to what the sort options do, only where the control lives.

- Mobile tab bar: the "Settings" tab is now "You" and shows your avatar (or your initial) instead of a gear icon, and every tab is now the same width without clipping its label. Fixed the active-tab highlight and the bar itself sometimes touching the screen's edges on narrow phones instead of matching its own padding, and fixed it touching the add button directly with no gap.
- Settings now stays inside the app's sidebar/tab bar like every other screen, instead of dropping to a bare page — pressing "You" no longer feels like leaving the app.
- Dashboard and Sets now have a visible page title at the top, matching the style Collection/Wishlist/Settings already use.

- Migrated the card detail view and the "add a card" dialog (`cards.css`) to Tailwind. `CardDetail.tsx`'s `margin-top` stayed in CSS (the `.modal--card` dialog variant overrides it to 0 — the same unconditional-Tailwind-vs-conditional-CSS trap ADR-0013 already covers). `CardNav.tsx`'s prev/next buttons needed their own `flex justify-between` alongside `CardDetail.tsx`'s wrapper, since `PublicCardDialog.tsx` passes a bare fragment instead of `CardNav` and relies on the wrapper for that layout.

- Migrated the collection page's card grid, sidebar rail, and card tiles (`cards.css`) to Tailwind, keeping a handful of class names as cross-file selector hooks where other not-yet-migrated files still depend on them. Fixed a follow-on bug where an unconditional Tailwind utility on the rail/main panes beat the CSS media query that swaps between them on narrow screens. Also fixed three places (the `/cards` loading skeleton, the card detail tag, and the public-collection view's own card grid) that were still relying on CSS already deleted elsewhere for the same class names.

- Continued the Tailwind migration through the rest of `cards.css`'s toolbar and dialog chrome: the segmented-track and layout-toggle controls (new shared `trackClasses.ts`), the set index grid, the filter/view dropdown-and-sheet shells (new shared `MenuDetails.tsx` and `Sheet.tsx` components, replacing duplicated markup in `FilterMenu`/`ViewMenu`/`FilterSheet`/`ViewSheet`), the card detail/add dialog sizing (`cardModalClasses.ts`), the `/cards` loading skeleton's outline sizes, and several dead CSS rules left over from earlier passes. `cards.css` is down to 1,365 lines, holding only properties that are genuinely cross-file hooks or conditionally overridden by ancestor context (documented in ADR-0013/ADR-0015). No visual or behavioural change intended.

- Migrated the /cards dashboard (KPI tiles, priciest-cards table, era/type bar charts), the Pokédex grid, and the sign-in/appearance profile screen (`cards.css`) to Tailwind. The Pokédex's hover-reveal step arrows and hover pill moved to `group`/`after:` variants; its container-query breakpoint moved to a Tailwind `@max-[560px]:` variant. Fixed a missed consumer (per ADR-0014): `CollectionValueCard.tsx` was still using two dashboard classes already deleted from `cards.css`.

- Migrated the active-filters chip row (`FilterChips.tsx`) and the collection value chart's SVG (`CollectionValueCard.tsx`) to Tailwind, and dropped an orphan `cards-value` class with no matching CSS rule. `Segmented.tsx`'s `.cards-segmented`/`.cards-segment` stay CSS for now: they're shared with `FilterOptions.tsx` and `ViewOptions.tsx`, both deferred pending the variant-prop redesign noted earlier in the migration.

- Fixed a real regression from an earlier migration pass: the Add Card dialog's inputs had lost their glass-control styling (border, background, height, focus ring) entirely, because the CSS class they read no longer existed anywhere in the DOM. Restored as Tailwind classes on `CardAddDialog.tsx`.
- Deleted `form.css` (fully redundant after the fix above) and `tokens.css`'s dead `.sr-only` rule (a byte-for-byte duplicate of Tailwind's own built-in utility). Migrated `.skip-link` to Tailwind classes in `app/layout.tsx`.

- Migrated the landing page (`landing.css`, 692 lines, single consumer `app/page.tsx`) to Tailwind utility classes and deleted the file. No visual or behavioural change intended.

- Rarity and type are no longer typed by hand: in the add-card dialog's catalogue search, picking a result now shows rarity and type as read-only facts rather than an editable field/chips. The existing collection (978 rows) has been backfilled from TCGdex the same way; 22 rows it couldn't confidently match are listed in `docs/rarity-type-backfill-corrections.md` for manual review. One trade-off: rarity used to double as which foil variant a printing was (non-holo/holo/reversed holo); neither catalogue has such a field, so that fact is no longer tracked — the card foil effect now keys off the catalogue's own rarity tier instead.

## 2026-08-14

- Signup no longer asks for a username — a friendly one is generated automatically, and you can pick your own later from Settings.

- Fixed every Postgres-backed account being unable to read its own collection or add a card through the API when authenticated by bearer token (the iOS app, curl) — row level security was correctly refusing a client that never carried the caller's session.
- Fixed account sign-up failing for any client that doesn't send a username at sign-up (the iOS app included) — the server-side fallback username was too long for its own constraint.
- Added quantity, condition, grade, purchase price, purchase date, notes and a favourite flag to each printing in the collection, with `PATCH`/`DELETE /api/v1/collection/items/{id}` to edit or remove one.
- Added `GET /api/v1/catalog/search?set=&query=` to find a card by name within a chosen set.
- `PATCH /api/v1/profile` and `GET /api/v1/profile` now accept a bearer token, not just a browser session.

- Rebuilt the public homepage as a premium product landing page with a static public-collection preview.
- Clarified that Card Orb is completely free and surfaced Cardmarket prices in euros as collector context.

- Migrated html/body base styling, the card surface, and the tag chip to Tailwind. Fixed a regression from an earlier pass where login/signup form fields had lost their border and background styling. Removed two unused CSS animations. No other visual change intended.

- Fixed a cascade-layers bug from the Tailwind migration where padding/margin utility classes were silently overridden by legacy CSS on every migrated component (spacing that used `gap` was unaffected, which is why it wasn't visible in screenshots). Migrated the outermost `/cards` and public-collection page shell to Tailwind.

- Migrated the login, signup, forgotten-password, set-password and profile sign-in forms from hand-written CSS to Tailwind (shared `FormField`/`SigninShell` components). Fixed a pre-existing bug where the 404 page's description text had no styling. No other visual change intended.

- Migrated the settings screens and the shared dialog shell (Modal) from hand-written CSS to Tailwind. No visual change intended.

- Started migrating hand-written CSS to Tailwind: Tailwind utilities are now available on every route (previously only the collection views), and the error-page and about-card styling now ship as Tailwind classes instead of separate stylesheets. No visual change intended.

- Migrated the floating tab bar and its mobile layout rules from hand-written CSS to Tailwind. No visual change intended.
