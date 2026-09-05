- A folder may now carry a rule and fill itself: `rule` on `POST /v1/folders` and
  `PATCH /v1/folders/{id}` takes a Pokédex range (`dex.from`–`dex.to`), sets and rarities, AND
  between the fields and OR within a list, and the folder then shows every owned copy that
  matches. `GET /v1/folders` says each folder's `kind` (`manual` or `rule`) and its `rule`, with
  `count` counting what it holds either way. `GET /v1/cards?collection=` answers a rule folder
  with its matches, and an id that is no folder is a 404 rather than an empty page.
  `PATCH /v1/collection/items/{id}` refuses to file a copy into a rule folder. A folder keeps
  its kind: a manual one cannot be given a rule, and a rule one cannot lose it.
