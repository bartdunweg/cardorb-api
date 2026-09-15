-- A printing's picture can be a TCGdex scan rather than a TCGplayer product (Bart, 2026-09-15):
-- Pokémon Card 151's Japanese scans on TCGdex are the Poke Ball print of each card that has one
-- (artwork.ts, TCGDEX_SCAN_PRINT). Such a row names no product.
alter table public.card_print_pictures alter column product_id drop not null;
