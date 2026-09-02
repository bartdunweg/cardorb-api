-- Two columns the web app added and nobody reads any more.
--
-- `wishlist` said what `owned = false` already says; the API has always read `owned`, and the
-- web app stopped writing `wishlist` on 2026-09-02 when it moved onto the API. `pokedex_numbers`
-- held pokemontcg.io's numbers for the web app's own Pokédex; the API decides which card is
-- which Pokémon from the catalogues. No policy, view or function refers to either (checked on
-- the live database before this was written).
alter table public.cards drop column if exists wishlist;
alter table public.cards drop column if exists pokedex_numbers;
