- `GET /v1/cards` says what the list is worth: `value` and `unpriced`, over the whole filtered
  list rather than the page, and a wishlist's facets now name its own sets and rarities. `sort=dex`
  puts the copies in national Pokédex order, trainers and energy last. A folder may be shown as a
  Pokédex: `pokedex` on `POST /v1/folders` and `PATCH /v1/folders/{id}` takes whether the missing
  Pokémon show and the range collected, `null` turns it off; the built-in Pokédex takes the same
  setting from `PATCH /v1/profile { pokedex }`.
