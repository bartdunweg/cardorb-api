# Held cards the catalogue does not match

A worklist, not a decision. 13 of the 1,610 cards in the binder resolve to no
TCGdex id, which means no scan, no price and no entry in a value snapshot. Every
one was checked against TCGdex by set and number on 16 August 2026, so the
"what TCGdex says" column below is what it actually answered rather than a guess.

Delete a row from this file once its card matches. Delete the file once it is
empty.

Related worklists, and worth reading before starting: `trainer-gallery-row-corrections.md`
(the same numbering problem, found by the ADR-0022 audit) and
`rarity-type-backfill-corrections.md`.

---

## 1. The number belongs to a different card — 6 rows

The pattern ADR-0022 documented and the reason the lookup is name-checked: the
number in the row resolves to a real card, just not this one. Fixing means
finding the right number, not forcing the match.

| set | number | name as recorded | what TCGdex says #number is |
| --- | --- | --- | --- |
| Silver Tempest | 178 | Regidrago | Mawile V |
| Journey Together | 172 | Iono's Lillbolt | Iono's Bellibolt ex |
| Stellar Crown | 170 | Hydrapple | Terapagos ex |
| Chilling Reign | 165 | Chansey | Zeraora V |
| Battle Styles | 154 | Single Strike Urshifu | Tyranitar V |
| Black Bolt | 085 | Professor's Research (Juniper) | Professor's Research |

**The last one is probably not a mistake.** TCGdex calls #085 "Professor's
Research" and the row calls it "Professor's Research (Juniper)" — the same card
with the subtitle that distinguishes which professor is on the art. The name
check rejects it, correctly by its own rule and wrongly in fact. Worth deciding
whether `sameCard()` should ignore a parenthesised suffix; that is a change to
matching, so it wants measuring against the whole collection before it ships.

`Iono's Lillbolt` also looks like a typo for `Iono's Bellibolt ex`, but the row
says #172 and TCGdex says #172 is that card, so this may be the same card typed
loosely rather than the wrong number. Check the physical card.

## 2. Trainer Gallery numbering — 4 rows

TCGdex does not use `TG` numbers. Lost Origin's Orbeetle, filed here as TG15, is
`#020` there; the other three are not findable by name either, so their subset
needs resolving rather than renumbering.

| set | number | name |
| --- | --- | --- |
| Lost Origin | TG12 | Centiskorch |
| Lost Origin | TG15 | Orbeetle |
| Lost Origin | TG17 | Eternatus |
| Silver Tempest | TG14 | Corviknight |

## 3. Genuinely not in the catalogue — 3 rows

Nothing to fix here. These will match on their own if and when TCGdex indexes
them, and no action is worth taking before that.

| set | number | name | why |
| --- | --- | --- | --- |
| MEP Black Star Promos | 088 | Zarude | TCGdex has `mep` indexed to #080 |
| XY Black Star Promos | 223 | Venusaur | 216 cards indexed, #223 not among them |
| Wizard Black Star Promos | — | Ancient Mew | TCGdex has no set by that name |

---

## Removed from the wishlist: 8 unreleased promos

Not part of the list above — these were **wanted**, not held — and they are
recorded here because they were deleted on 16 August 2026 at Bart's request.

They are the same case as section 3: `MEP Black Star Promos` #101–110, which
TCGdex has indexed only to #080. They are not yet released, so no catalogue has
them, so they carried no scan and no price and sat blank in the wishlist.

The rows as they were are in `wishlist-promos-removed-2026-08-16.json` beside
this file, so re-adding them is a paste rather than a retype. Once TCGdex
indexes that set they will match like anything else — there is nothing to fix in
the app.

| number | name | rarity |
| --- | --- | --- |
| 101 | Nidorina | Illustration Rare |
| 102 | Victini | Illustration Rare |
| 103 | Zeraora | Illustration Rare |
| 106 | Ditto | Illustration Rare |
| 107 | Pikachu | Special Illustration Rare |
| 108 | Espeon | Special Illustration Rare |
| 109 | Pikachu | Special Illustration Rare |
| 110 | Umbreon | Special Illustration Rare |
