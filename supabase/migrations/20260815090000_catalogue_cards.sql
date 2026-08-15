-- A cross-set index of the TCGdex catalogue, so "find this card" does not have
-- to start with "which set is it in".
--
-- setCatalogue() in lib/core/catalogue.ts answers "everything about one named
-- set" and is deliberately scoped that way (docs/decisions/0008): resolving a
-- set and walking its cards is the expensive half of this app, worth caching
-- per set but not worth doing live, uncached, on every keystroke of a search
-- box. That reasoning does not rule out search across every set, only doing it
-- live. This table is the other half of that answer: the full walk happens
-- once, on a timer (see the catalogue-refresh cron route), and a search reads
-- this table instead of asking TCGdex anything at all.
--
-- Unlike public.cards, nobody owns a row here. It is reference data — the same
-- card looks the same to everyone — so there is one read policy and no user_id
-- column at all. Only the refresh job writes, via the service-role client,
-- which bypasses RLS entirely; there is deliberately no insert/update/delete
-- policy for anon or authenticated callers.

create extension if not exists pg_trgm;

create table if not exists public.catalogue_cards (
  id            text primary key,
  local_id      text not null,
  name          text not null,
  set_id        text not null,
  set_name      text not null,
  image         text,
  asset_base    text,
  set_has_scans boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- Trigram rather than a plain btree, because the search this serves is
-- substring ("char" should find "Charizard"), not prefix.
create index if not exists catalogue_cards_name_trgm_idx
  on public.catalogue_cards using gin (lower(name) gin_trgm_ops);

create index if not exists catalogue_cards_local_id_idx
  on public.catalogue_cards (lower(local_id));

create index if not exists catalogue_cards_set_id_idx
  on public.catalogue_cards (set_id);

-- searchCatalogue()'s optional `set` narrowing (lib/core/catalogue-index.ts).
create index if not exists catalogue_cards_set_name_idx
  on public.catalogue_cards (set_name);

-- refreshCatalogueIndex()'s prune, which finds "everything an older run
-- wrote and this run didn't touch" with a single lt(updated_at) filter.
create index if not exists catalogue_cards_updated_at_idx
  on public.catalogue_cards (updated_at);

alter table public.catalogue_cards enable row level security;

-- The whole point: a stranger's search should work with no key at all, same as
-- /api/v1/collection already does for the same reason.
drop policy if exists catalogue_cards_read on public.catalogue_cards;
create policy catalogue_cards_read on public.catalogue_cards for select
  using (true);
