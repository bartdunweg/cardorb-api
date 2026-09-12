-- The catalogue as one document, for the browser to search in.
--
-- A search that asks a server is a round trip however fast the query is: 0.7 to 1.0 s from
-- cardorb.com on 2026-09-11 with the copy filled and the query itself at 1 ms, all of it hops.
-- The 23,000 English cards compressed are a few hundred kilobytes, which a browser fetches
-- once a day and searches in memory; what is personal (owned, wishlist) or daily (price) is
-- asked afterwards for the twenty hits shown. So the copy is also kept as one document, built
-- after every nightly copy, and served whole under its version.
--
-- One row per language; only English for now. Text, not jsonb: it is read and written whole,
-- never queried into. Service role only, like the tables it is built from.
create table if not exists public.catalogue_index (
  language   text primary key,
  -- The copy's latest synced_at when the document was built; a newer copy means a rebuild.
  version    text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);

alter table public.catalogue_index enable row level security;
