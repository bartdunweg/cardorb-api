-- The wishlist on the public profile too, beside the collection. Off by default and only
-- meaningful while the profile itself is public: the public routes answer 404 before either
-- flag is looked at. Read for a visitor through the same profile row the public profile is.
alter table public.profiles add column if not exists wishlist_public boolean not null default false;
comment on column public.profiles.wishlist_public is
  'Show the wishlist on the public profile as well. Only while is_public.';
