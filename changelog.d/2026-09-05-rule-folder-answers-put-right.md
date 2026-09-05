- Three answers put right after review. `GET /v1/cards?collection=` on a rule folder now
  keeps its matches when `owned=false` is also given, as the contract said. A folder body may
  be 8 kB, so a rule with twenty sets and twenty rarities is no longer refused as too large.
  `GET /v1/folders` carries `catalogueUnavailable` during a TCGdex outage, when a rule
  folder's `count` is low for want of Pokédex numbers and set titles.
