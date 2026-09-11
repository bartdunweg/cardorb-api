- A card from the Japanese, Korean or Chinese shelves lands in its Pokédex slot. It is named in
  that language and the species list is English, so every one of them was filed nowhere — which
  on that page reads as "you do not own this". `scripts/pokedex.mjs` now writes the same 1,025
  species in those languages beside the English ones, and the matching takes the longest name in
  whichever script the card is written in.
- `scripts/pokedex.mjs` writes where the file actually lives. It resolved `lib/core` rather than
  `src/lib/core`, so it threw before writing anything — the fourth script with that gap.
