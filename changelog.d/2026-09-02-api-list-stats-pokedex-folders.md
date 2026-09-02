- The API grew what the web app needs to stop reading the database itself: `GET /v1/cards`
  answers one page of the collection as a flat list (search, wishlist, favourites, folder,
  paging), `GET /v1/stats` the dashboard's numbers, `GET /v1/pokedex` the 1,025 slots with a
  count and a picture each, and `/v1/folders` makes, renames and deletes the folders a person
  sorts cards into. A copy now carries `collectionId`, and `PATCH /v1/collection/items/{id}`
  files it. Everything under `/v1` that existed keeps its shape.
