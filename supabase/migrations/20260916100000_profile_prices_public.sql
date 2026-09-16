-- Prices on the public profile too: what each card trades at and what the collection is worth.
-- One flag beside wishlist_public and favorites_public, off by default: a collection's value is
-- the owner's to show, and until now the public routes stripped every figure whatever they wanted.
-- Only meaningful while is_public: the public routes answer 404 before the flag is looked at.
alter table public.profiles add column if not exists prices_public boolean not null default false;
comment on column public.profiles.prices_public is
  'Show card prices and the collection''s value on the public profile as well. Only while is_public.';
