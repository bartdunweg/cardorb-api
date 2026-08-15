# Trainer Gallery rows to correct in Notion

A worklist, not a decision — the reasoning is in
`docs/decisions/0022-gallery-artwork-via-pokemontcg.md`. Delete this file once the rows
are fixed.

## Why these 23 rows have no artwork

They are 23 of the 26 owned cards in the collection with no scan. Every one of them is a
Trainer Gallery card, and every one is filed under a number or a name that no catalogue
recognises, so the guard in `buildCollection()` — "a number that resolves to a different
Pokémon means the numbering does not line up, and a wrong scan is worse than a missing
one" — correctly refuses to give them a picture.

The catalogues are not the ones that are wrong. TCGdex and pokemontcg.io agree with each
other on all 23, and the printed card agrees with them: the Silver Tempest Jynx has
**TG04/TG30** printed in its bottom-left corner, where this collection has Druddigon at
TG04.

Correcting a row fixes more than its picture. The number is also what its price, its
detail page and its place in prev/next navigation are looked up by.

The gallery cards not listed here are already correct and already have artwork.

## Silver Tempest — 13 rows, all mis-numbered

Largely a permutation: several of these are each other's numbers.

| filed as | should be | what is really at that number |
| --- | --- | --- |
| `TG04` Druddigon | `TG09` Druddigon | Jynx |
| `TG05` Altaria | `TG11` Altaria | Gardevoir |
| `TG06` Mawile | `TG17` Mawile V | Malamar |
| `TG08` Jynx | `TG04` Jynx | Passimian |
| `TG09` Passimian | `TG08` Passimian | Druddigon |
| `TG10` Zeraora | `TG16` Zeraora V | Smeargle |
| `TG11` Smeargle | `TG10` Smeargle | Altaria |
| `TG12` Blaziken | `TG14` Blaziken V **or** `TG15` Blaziken VMAX | Kricketune V |
| `TG14` Corviknight | `TG18` Corviknight V **or** `TG19` Corviknight VMAX | Blaziken V |
| `TG15` Malamar | `TG06` Malamar | Blaziken VMAX |
| `TG16` Blissey | `TG22` Blissey V | Zeraora V |
| `TG17` Gardevoir | `TG05` Gardevoir | Mawile V |
| `TG18` Kricketune | `TG12` Kricketune V | Corviknight V |

## Lost Origin — 8 rows, all mis-numbered

| filed as | should be | what is really at that number |
| --- | --- | --- |
| `TG07` Snorlax | `TG10` Snorlax | Banette |
| `TG08` Banette | `TG07` Banette | Hisuian Arcanine |
| `TG10` (Hisuian) Arcanine | `TG08` Hisuian Arcanine | Snorlax |
| `TG12` Centiskorch | `TG14` Centiskorch V **or** `TG15` Centiskorch VMAX | Orbeetle V |
| `TG13` Gallade | `TG19` Gallade V | Orbeetle VMAX |
| `TG14` Crobat | `TG20` Crobat V | Centiskorch V |
| `TG15` Orbeetle | `TG12` Orbeetle V **or** `TG13` Orbeetle VMAX | Centiskorch VMAX |
| `TG17` Eternatus | `TG21` Eternatus V **or** `TG22` Eternatus VMAX | Pikachu VMAX |

## Brilliant Stars — 2 rows, numbers are fine, names are back to front

| filed as | should be |
| --- | --- |
| `TG18` Urshifu Single Strike | `TG18` **Single Strike Urshifu** |
| `TG20` Urshifu Rapid Strike | `TG20` **Rapid Strike Urshifu** |

The word order is the whole problem. `sameCard()` strips a trailing `V`/`VMAX` before
comparing and tolerates two typos, so "Single Strike Urshifu" matches "Single Strike
Urshifu V" without any further change — but it will not reorder words, and it should not:
that is how it keeps Mew from matching Mewtwo.

## Where the ambiguity is

Five rows say only "Blaziken", "Corviknight", "Centiskorch", "Orbeetle" or "Eternatus"
where the set has both a V and a VMAX printing under different numbers. The stored rarity
is "Rare Holo" for every gallery row, so nothing in the data distinguishes them. Look at
the card. Once the row names the printing ("Blaziken VMAX"), the number follows from the
table above — and `sameCard()` will accept "Blaziken" against "Blaziken V" either way, so
only the number strictly has to be right.

## The three owned cards this does not cover

Not gallery cards, each blank for its own reason, and each a separate question:
Ancient Mew (Wizard Black Star Promos, no number at all), Set 1 Unlimited `68` Voltorb,
XY Black Star Promos `223` Venusaur.
