-- The shape of a collection that belongs to somebody.
--
-- Until now there was one collection and it lived in Notion, where the question
-- "whose card is this" had no answer because it had no second person to tell
-- apart. Everything below exists to answer it, and the answer is enforced by
-- Postgres rather than by a WHERE clause somebody remembered to write: every
-- table here has row level security on, and the policies at the bottom are the
-- wall. A bug in a query is then a query that returns nothing, not a query that
-- returns somebody else's binder.
--
-- Run against a fresh project with `supabase db push`, or paste into the SQL
-- editor. It is written to be re-runnable up to the point of the seed data.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ─── Profiles ───────────────────────────────────────────────────────────────

-- The public half of an account: a name to reach it by and a switch that says
-- whether anyone may.
--
-- Separate from auth.users because that table holds the email and the password
-- hash and is not ours to open up. A profile is readable by strangers on
-- purpose — /user/<name> cannot resolve a name without reading one — so it must
-- contain nothing that a stranger reading it would be a problem.
--
-- is_public defaults to false. The first release of accounts should not turn a
-- thousand new collections into a thousand public pages because a default said
-- so; sharing is something you do, not something that happens to you.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      citext not null unique,
  display_name  text check (length(display_name) <= 60),
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Two to thirty characters, lowercase, no leading hyphen. citext makes the
  -- uniqueness case-insensitive, so "Bart" cannot be claimed once "bart" is:
  -- two names that differ only in case are the same name to everyone reading
  -- them, and letting both exist is an impersonation tool rather than a feature.
  constraint username_shape check (username ~ '^[a-z0-9][a-z0-9-]{1,29}$')
);

-- Names the app needs for itself, or that would read as the app speaking.
--
-- A table rather than a list in the code because it is data the claim below has
-- to consult inside the same statement, and a round trip to the application to
-- ask "is this reserved" is a round trip two people can both win.
create table if not exists public.reserved_usernames (
  name   citext primary key,
  reason text
);

-- ─── Cards ──────────────────────────────────────────────────────────────────

-- One row per printing held or wanted, which is the shape the Notion database
-- had, because that shape was right.
--
-- The alternative was a card with an array of variants on it. It loses on three
-- counts: deleting one printing becomes a read-modify-write of a blob, a
-- variant cannot carry its own acquired_at (you bought the reverse holo in
-- March and the normal one in July), and "which cards were in the binder on
-- this date" stops being answerable in SQL, which is the one question
-- scripts/snapshot-collection-value.mjs exists to ask.
--
-- OwnedCard.variants in lib/core/cards.ts stays what it always was: a derived
-- thing, folded out of these rows at render time.
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  -- Defaulted rather than passed in. An insert that forgets to say whose card
  -- this is gets the caller's own id, and the policy below would refuse it
  -- anyway — but a default means the application cannot get it wrong in the
  -- first place, which is cheaper than a test that checks it did not.
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,

  name         text not null check (length(name) between 1 and 200),
  -- As it is written down, usually zero-padded ("088"). Text and not a number:
  -- "088", "TG12" and "SV107" are all card numbers and only one of them is an
  -- integer.
  number       text not null default '' check (length(number) <= 40),
  set_name     text not null check (length(set_name) between 1 and 120),
  rarity       text check (length(rarity) <= 120),
  gen          text check (length(gen) <= 120),
  types        text[] not null default '{}' check (cardinality(types) <= 10),

  -- Notion's Collection checkbox: in the binder rather than on the wishlist.
  -- Defaults to true because in Notion a missing checkbox meant owned, and
  -- lib/core/cards.ts reads it as `!== false` for exactly that reason. The
  -- default is what carries that reading across the move.
  owned        boolean not null default true,
  -- Notion's Excluded checkbox: kept out of the "latest pull" on
  -- bartdunweg.com. Written here, never read by this app. It survives the move
  -- because the portfolio is the only thing that has ever cared about it, and
  -- dropping a column because the app that writes it does not read it is how
  -- another repo breaks quietly.
  excluded     boolean not null default false,

  -- What Notion's created_time was: when this printing joined the collection.
  -- Deliberately not created_at, which is when this row was written. A card
  -- imported today may have been pulled in 2019, and the value series in
  -- scripts/snapshot-collection-value.mjs is built entirely on knowing the
  -- difference — valuing today's cards at yesterday's prices answers a question
  -- nobody asked.
  acquired_at  timestamptz not null default now(),

  -- Where the row came from, and its id over there. Together with user_id they
  -- make the unique index below, which is the whole of what makes an import
  -- idempotent: run it again next month and only the new pages arrive.
  source       text not null default 'manual'
                 check (source in ('manual','csv','notion')),
  source_id    text check (length(source_id) <= 200),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cards_user_set_idx
  on public.cards (user_id, set_name);
-- For "the newest card", which is what the portfolio's latest-pull asks.
create index if not exists cards_user_acquired_idx
  on public.cards (user_id, acquired_at desc);
-- Partial, because a manually added card has no source_id and there is no sense
-- in which two of those collide.
create unique index if not exists cards_source_idx
  on public.cards (user_id, source, source_id)
  where source_id is not null;

-- ─── Connections ────────────────────────────────────────────────────────────

-- Somebody's own Notion integration, so their database can be imported without
-- this app holding a key to it forever.
--
-- `secret` is AES-256-GCM ciphertext and never the token itself. This table is
-- readable by its owner through the policy below, and a plaintext token in a
-- readable row is a token in every backup, every replica and every log line
-- that ever prints a query. The key lives in SECRETS_KEY, in the environment,
-- where the database cannot reach it.
create table if not exists public.connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('notion')),
  secret          text not null,
  database_id     text not null check (length(database_id) <= 200),
  -- What the last import found, so the settings screen can say something more
  -- useful than "connected".
  last_import_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  -- One Notion connection each. A second one is a feature nobody has asked for
  -- and a merge conflict waiting to be designed.
  unique (user_id, kind)
);

-- ─── Imports ────────────────────────────────────────────────────────────────

-- What happened, each time somebody pressed the button.
--
-- Worth a table rather than a log line because an import is the one operation
-- here that can be surprising after the fact: "it says 1,204 added and I have
-- 1,600 cards" is a question that needs an answer, and the answer is a row with
-- counts on it.
create table if not exists public.imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('csv','notion')),
  status       text not null default 'running'
                 check (status in ('running','done','failed')),
  rows_seen    integer not null default 0,
  rows_added   integer not null default 0,
  rows_skipped integer not null default 0,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- ─── The trigger that makes a profile inevitable ────────────────────────────

-- An account without a profile is an account with no name to reach it by, and
-- every page that resolves a username would have to handle it. So the profile
-- is made in the same transaction as the user, from the metadata the sign-up
-- route passes along.
--
-- security definer because it writes to public.profiles as the new user before
-- that user has a session to write with. The empty search_path is not
-- decoration: a security definer function without one can be redirected at a
-- table of somebody else's choosing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- The route validates and claims the name; this is the floor under it, so a
    -- user created any other way (the dashboard, a script) still gets a profile
    -- rather than a foreign key nobody can satisfy.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'u' || replace(new.id::text, '-', '')
    ),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Row level security ─────────────────────────────────────────────────────

alter table public.profiles    enable row level security;
alter table public.cards       enable row level security;
alter table public.connections enable row level security;
alter table public.imports     enable row level security;
alter table public.reserved_usernames enable row level security;

-- A profile is a name and a switch. Readable when the switch is on, or when it
-- is yours: without the first half /user/<name> cannot resolve anybody, and
-- with `using (true)` the whole membership list is one request away.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (is_public or id = auth.uid());

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Your own cards, always. Someone else's only where they have said so.
--
-- Prices are not mentioned here and never will be: a price is not stored, it is
-- looked up from Cardmarket at render time, and stripPrices() in
-- lib/core/cards.ts takes it out before the public page is built. There is
-- nothing in this table to hide.
drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = cards.user_id and p.is_public
    )
  );

drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards for insert
  with check (user_id = auth.uid());

drop policy if exists cards_update on public.cards;
create policy cards_update on public.cards for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards for delete
  using (user_id = auth.uid());

-- Connections and imports are yours alone, with no public half at all. One
-- holds a credential and the other holds a history of what you own; neither has
-- a reading in which a stranger should see it.
drop policy if exists connections_own on public.connections;
create policy connections_own on public.connections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists imports_own on public.imports;
create policy imports_own on public.imports for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Readable by anyone signed in, so the sign-up form can say "that one is taken"
-- before the submit rather than after. There is nothing sensitive in a list of
-- words the app will not give out.
drop policy if exists reserved_read on public.reserved_usernames;
create policy reserved_read on public.reserved_usernames for select
  using (true);

-- ─── The two things PostgREST cannot say ────────────────────────────────────

-- What cardFields() used to ask Notion's schema for.
--
-- The difference is worth knowing about: Notion answered with every option that
-- had ever been *defined*, and this answers with every option that is *in use*.
-- So a set whose last card is deleted stops being offered, which is better, and
-- a brand new account opens the add dialog with four empty lists, which is
-- honest — those forty-eight sets were one person's, not the product's.
--
-- security invoker, so it sees exactly what the caller's policies let it see.
create or replace function public.collection_options()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'sets',     coalesce((select json_agg(distinct set_name order by set_name)
                            from cards where user_id = auth.uid()), '[]'::json),
    'rarities', coalesce((select json_agg(distinct rarity order by rarity)
                            from cards where user_id = auth.uid()
                             and rarity is not null), '[]'::json),
    'gens',     coalesce((select json_agg(distinct gen order by gen)
                            from cards where user_id = auth.uid()
                             and gen is not null), '[]'::json),
    'types',    coalesce((select json_agg(distinct t order by t)
                            from cards, unnest(types) t
                           where user_id = auth.uid()), '[]'::json)
  );
$$;

-- Claiming a name, checked against the reserved list in the same statement so
-- that two people pressing the button at the same moment cannot both win.
--
-- Raises rather than returns a boolean, because the two failures need telling
-- apart in the form: "that name is taken" and "that name is not available" are
-- different sentences, and unique_violation versus this explicit raise is how
-- the route knows which to say.
create or replace function public.claim_username(wanted citext)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from reserved_usernames where name = wanted) then
    raise exception 'reserved' using errcode = 'P0001';
  end if;
  update profiles set username = wanted, updated_at = now() where id = auth.uid();
  if not found then
    insert into profiles (id, username) values (auth.uid(), wanted);
  end if;
end $$;

-- ─── Seed: the names the app will not give out ──────────────────────────────

insert into public.reserved_usernames (name, reason) values
  -- Route names. A user called "cards" would shadow a page.
  ('api', 'route'), ('cards', 'route'), ('login', 'route'), ('user', 'route'),
  ('settings', 'route'), ('auth', 'route'), ('sitemap', 'route'),
  ('robots', 'route'), ('manifest', 'route'), ('icon', 'route'),
  ('opengraph-image', 'route'), ('apple-icon', 'route'),
  -- Reserved by the framework or the platform.
  ('_next', 'framework'), ('www', 'platform'), ('static', 'platform'),
  -- Names that would read as the app speaking.
  ('admin', 'impersonation'), ('root', 'impersonation'),
  ('support', 'impersonation'), ('help', 'impersonation'),
  ('staff', 'impersonation'), ('team', 'impersonation'),
  ('cardorb', 'impersonation'), ('official', 'impersonation'),
  ('security', 'impersonation'), ('billing', 'impersonation'),
  -- Generic enough to be worth keeping back.
  ('me', 'generic'), ('new', 'generic'), ('about', 'generic'),
  ('terms', 'generic'), ('privacy', 'generic'), ('legal', 'generic')
on conflict (name) do nothing;
