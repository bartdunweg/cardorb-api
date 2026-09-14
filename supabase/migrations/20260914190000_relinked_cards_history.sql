-- Seventeen English cards were linked to another card's TCGplayer product until #410 (2026-09-14):
-- Pokémon Rumble Starmie and Gyarados to Ninetales, seven Brilliant Stars Trainer Gallery cards to
-- their main-set namesakes, Aquapolis a/b twins, Celebrations Classic Collection Reshiram and Zekrom,
-- Treecko, a trainer kit Lightning Energy. Their history, back to 2024-02, is the other card's.
-- It goes; scripts/backfill-card-prices.mjs --only daily --ids <these> writes their own.
delete from card_price_months
where tcg_id in (
  'ru1-5', 'ru1-6', 'np-16',
  'swsh9tg-TG06', 'swsh9tg-TG07', 'swsh9tg-TG08', 'swsh9tg-TG16', 'swsh9tg-TG17',
  'swsh9tg-TG24', 'swsh9tg-TG26',
  'tk-sm-r-2',
  'cel25cc-CC020', 'cel25cc-CC021',
  'ecard2-50b', 'ecard2-74b', 'ecard2-103b', 'ecard2-95a'
);
