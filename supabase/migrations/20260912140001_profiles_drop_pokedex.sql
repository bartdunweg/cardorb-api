-- The Pokédex is a binder now (20260912120000_pokedex_becomes_a_binder.sql), and these two
-- columns are what the fixture left behind. Nothing reads them: the web takes its setting from
-- the binder, the iOS app has no Pokédex, and GET /v1/pokedex went with this change. Nothing
-- legacy stays on an account for a thing the app no longer has.
alter table public.profiles drop column if exists pokedex;
alter table public.profiles drop column if exists pokedex_public;
