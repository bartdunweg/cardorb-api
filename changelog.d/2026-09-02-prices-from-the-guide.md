- A card's price comes from Cardmarket's own price guide now — one file, read once a day —
  instead of one TCGdex request per card. A cold build of the collection used to take minutes,
  during which the first visitor after a deploy waited or gave up; it takes seconds. TCGdex is
  asked only for a card the guide does not know yet, and the numbers agree with the nightly
  snapshot to the cent.
