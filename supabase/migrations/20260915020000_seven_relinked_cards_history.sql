-- Seven English cards relinked to their own TCGplayer product (2026-09-14): the Lycanroc and Alolan
-- Raichu kits' Hau #19 and #23 and Great Ball #21 and #25, the Latios kit's Acro Bike and the Suicune
-- kit's Tierno (each had the other half-deck's product), and Nintendo Black Star Promos 36 Tropical
-- Tidal Wave (a Worlds staff card's product). Their history was the wrong product's, and the merge
-- that writes history never erases a day, so it goes whole and is filled again from TCGplayer's
-- archive for the right product (backfill-card-prices.mjs --only daily --ids).
delete from public.card_price_months
where tcg_id in (
  'tk-sm-l-19', 'tk-sm-l-23', 'tk-sm-r-21', 'tk-sm-r-25', 'tk-xy-latio-20', 'tk-xy-su-20', 'np-36'
);
