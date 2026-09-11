-- The English catalogue, kept here, so a search is a query and not a round trip.
--
-- A search for a card to add asked TCGdex twice per keystroke: once for the hits, and once
-- more, over GraphQL, for the rarity and the types of the twenty shown — and that second
-- call is a POST, which nothing caches, and took 1.7 to 2.1 seconds on its own (measured
-- 2026-09-11, cardorb.com, "charizard": 2.9 s the first time, 1.5 s with the list cached).
-- Rarity and type do not change between one night and the next, and the 23,000 English cards
-- fit in a table with room to spare. So a cron copies the catalogue in, set by set, and the
-- search reads the copy; TCGdex is asked only where the copy has nothing yet.
--
-- ── What is a fact here ────────────────────────────────────────────────────
--
-- Everything in this table is the catalogue's word, copied: name, number, set, rarity, types
-- and the address of the scan. Nothing is edited here and nothing of anybody's is in it, the
-- same line card_prices draws — a fact about a card, not about a person. The collection still
-- says what is owned; this table only says what a card is.
--
-- ── Who may read and write it ──────────────────────────────────────────────
--
-- Nobody but the service role. The search route reads it through adminClient(), which is the
-- one client that may read a table without a person behind it, because there is no person's
-- data to protect: a card's rarity is the same for everyone. Writes are the nightly cron's
-- alone. Row level security is on with no policy, which is how "service role only" is spelled.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.catalogue_cards (
  -- TCGdex's id ("sv03.5-006"), the one every price and every row's catalogue id is keyed by.
  id           text primary key,
  set_id       text not null,
  -- The number printed on the card, as the catalogue spells it ("006", "TG12", "SVP001").
  local_id     text not null,
  name         text not null,
  set_name     text not null,
  -- The era, as TCGdex names its serie ("Scarlet & Violet"). Null where the index had none.
  series       text,
  -- "YYYY/MM/DD", sortable as a string, the way CatalogueSet carries it. Newest first is the
  -- order every list in the app reads, and the one the search answers in.
  release_date text,
  rarity       text,
  types        text[] not null default '{}',
  -- The scan's stem, without size or format ("https://assets.tcgdex.net/en/sv/sv03.5/006");
  -- null where the record names no scan. The size and the format are the reader's to add.
  image        text,
  -- What the free search matches every word against: name, number and set name, lowercased,
  -- in one column so one trigram index covers the three.
  search       text generated always as (lower(name || ' ' || local_id || ' ' || set_name)) stored,
  synced_at    timestamptz not null default now()
);

-- `search ilike '%word%'` per word, which is what a trigram index answers.
create index if not exists catalogue_cards_search_idx
  on public.catalogue_cards using gin (search extensions.gin_trgm_ops);
-- The filter mode's own fields, each on its own.
create index if not exists catalogue_cards_name_idx
  on public.catalogue_cards using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists catalogue_cards_set_name_idx
  on public.catalogue_cards using gin (lower(set_name) extensions.gin_trgm_ops);
create index if not exists catalogue_cards_types_idx
  on public.catalogue_cards using gin (types);
-- The order every answer is read in, and the sync's way of dropping one set's rows.
create index if not exists catalogue_cards_order_idx
  on public.catalogue_cards (release_date desc, set_id, local_id);
create index if not exists catalogue_cards_set_idx
  on public.catalogue_cards (set_id);

-- One line per set the cron has copied, so a run knows what is oldest and what is missing.
-- `cards` is how many it wrote; a set whose index count has moved since is copied again first.
create table if not exists public.catalogue_sync (
  set_id    text primary key,
  cards     integer not null,
  synced_at timestamptz not null default now()
);

alter table public.catalogue_cards enable row level security;
alter table public.catalogue_sync enable row level security;
