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

Searching each set by name narrows most of these but settles none, because the
recorded name is the species and the catalogue's is the card. "Regidrago" in
Silver Tempest is five cards — V at #135, #183 and #184, VSTAR at #136 and #201 —
and the recorded rarity does not choose between them: all six rows below carry
the pre-backfill vocabulary ("Rare Holo", "Reversed Holo"), which survived
precisely because they never matched.

Two of them do not narrow at all, and that is worth knowing before hunting:
**Chilling Reign has no Chansey** and **Lost Origin has no Centiskorch or
Eternatus in its main set** — see section 2 for the second one. So for Chansey
either the set or the name is wrong, not the number.

| set | number | name as recorded | what TCGdex says #number is |
| --- | --- | --- | --- |
| Silver Tempest | 178 | Regidrago | Mawile V — candidates: **#135**/#183/#184 (V), **#136**/#201 (VSTAR) |
| Journey Together | 172 | Iono's Lillbolt | Iono's Bellibolt ex — **the number is right**; "Lillbolt" is a typo for "Bellibolt ex" |
| Stellar Crown | 170 | Hydrapple | Terapagos ex — candidates: #014, **#156**, **#167** (all Hydrapple ex) |
| Chilling Reign | 165 | Chansey | Zeraora V — **no Chansey in this set at all**; check the set or the name |
| Battle Styles | 154 | Single Strike Urshifu | Tyranitar V — candidates: #85/#150/#151 (V), #86/**#167**/**#168** (VMAX) |
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

## 2. Trainer Gallery — 4 rows, and the number really is the only problem

**Correction.** An earlier version of this file said these needed `set_name`
changed to "Lost Origin Trainer Gallery" as well as the number, because TCGdex
files the gallery as its own set. The first half is true and the conclusion was
wrong: the app already resolves a `TG` number filed under the base set to the
gallery set. Checked against the live collection — 69 of this binder's 73
Trainer Gallery cards match `swsh11.5tg-TG…` and `swsh12.5tg-TG…` today, from
rows whose `set_name` says plainly "Lost Origin" or "Silver Tempest". The subset
resolution in `lib/core/cards.ts` has been doing this the whole time.

So there are four broken rows, not seventy-four, and Bart's original reading was
right both times: the name is his, the number is wrong, and nothing else needs
touching.

They are broken for the reason the lookup is name-checked. `TG12` in Lost Origin
is Orbeetle V; the row says Centiskorch, so the match is refused rather than
silently taking the wrong card. The numbers are cross-wired in pairs — recorded
TG12 is Centiskorch but TG12 is Orbeetle, recorded TG15 is Orbeetle but TG15 is
Centiskorch.

Each name is still two cards, the V and the VMAX, and nothing recorded chooses
between them: all four carry "Rare Holo", the pre-backfill vocabulary they kept
*because* they never matched. That needs the physical card.

| set | recorded # | name | correct # |
| --- | --- | --- | --- |
| Lost Origin | TG12 | Centiskorch | **TG14** (V) or **TG15** (VMAX) |
| Lost Origin | TG15 | Orbeetle | **TG12** (V) or **TG13** (VMAX) |
| Lost Origin | TG17 | Eternatus | **TG21** (V) or **TG22** (VMAX) |
| Silver Tempest | TG14 | Corviknight | **TG18** (V) or **TG19** (VMAX) |

One more row has the same shape but already matches, so it is not in the list
above and is worth knowing about anyway: **Silver Tempest TG12 "Blaziken"** —
TG12 there is Kricketune V, and Blaziken is TG14 (V) / TG15 (VMAX).

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
