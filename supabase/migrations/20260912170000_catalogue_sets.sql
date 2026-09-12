-- The sets of the catalogue's copy, beside its cards.
--
-- `catalogue_cards` has held the copy since #326: the search reads it instead of asking TCGdex
-- twice per keystroke. The collection never did. Every read of somebody's cards still resolved
-- its sets over HTTP, against the same catalogue the copy was made from: the set index, then one
-- request per set, then a HEAD per set to see whether it has artwork at all, and a per-card
-- fallback chain for what was left. That is the path that put TCGdex between a person and their
-- own collection, and it is the path that emptied set 151 on 2026-09-12.
--
-- The cards were already here. What was missing was the sets themselves: a name to resolve, the
-- abbreviation the API hands out, the logo, the date and the count. This is that half, filled by
-- the same nightly copy.
create table if not exists public.catalogue_sets (
  id text primary key,
  name text not null,
  series text,
  release_date text,
  logo text,
  symbol text,
  abbreviation text,
  -- Every card in the set, secret rares included, and the number printed on them.
  total integer,
  printed_total integer,
  synced_at timestamptz not null default now()
);

-- Resolving a collection's set name asks by name, without case, and the copy is small (a few
-- hundred rows), so this is the one index it needs.
create index if not exists catalogue_sets_name_idx on public.catalogue_sets (lower(name));

comment on table public.catalogue_sets is 'The catalogue''s sets, copied nightly beside catalogue_cards. A copy, never the truth: TCGdex is.';

-- Read by the service role only, like catalogue_cards: every route that serves this reads as the
-- server. No grant to anon or authenticated.
alter table public.catalogue_sets enable row level security;
