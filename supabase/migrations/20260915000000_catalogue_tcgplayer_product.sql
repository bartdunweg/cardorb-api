-- A card of the copy names its TCGplayer product (Bart, 2026-09-14: every card priced out of the
-- one store, English and Japanese alike).
--
-- The Japanese copy now reads TCGplayer's Japanese shelf as a second catalogue (tcgplayer-japan.ts):
-- the cards of the 53 sets TCGdex lists without any, and a product for cards the committed id map
-- (tcgplayer-ids.ja.generated.json) does not name. The price reads look the product up here where
-- the map has none. Null where no product was matched, and on every English row, whose products the
-- committed English map names.
alter table public.catalogue_cards add column if not exists tcgplayer_product_id integer;
