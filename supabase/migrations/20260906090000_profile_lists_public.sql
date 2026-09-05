-- The favorites and the Pokédex on the public profile too, beside the collection and the
-- wishlist: one flag each, like wishlist_public. Off by default and only meaningful while the
-- profile itself is public: the public routes answer 404 before either flag is looked at.
alter table public.profiles add column if not exists favorites_public boolean not null default false;
alter table public.profiles add column if not exists pokedex_public boolean not null default false;
comment on column public.profiles.favorites_public is
  'Show the favorites on the public profile as well. Only while is_public.';
comment on column public.profiles.pokedex_public is
  'Show the Pokédex on the public profile as well. Only while is_public.';
