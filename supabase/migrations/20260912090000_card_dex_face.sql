-- One card of a Pokémon leads its Pokédex slot: the card whose picture the slot shows. Set by
-- swiping to it in the app, and the app clears the one it replaces, because species_id is read
-- from the catalogue at request time and is not a column anything here could search on.
alter table public.cards add column if not exists dex_face boolean not null default false;
comment on column public.cards.dex_face is
  'True for the card that leads its Pokémon''s Pokédex slot. At most one per owner per species, kept by the app.';
