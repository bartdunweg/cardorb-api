-- What the web app (bartdunweg/cardorb-web) made in the dashboard, written down here so a
-- reader of this repository can see the schema the API runs against. Every statement is
-- idempotent: on a database where the web app already did this, it changes nothing.
--
-- Folders: the `collections` table. "Collection" means the whole of what a person owns
-- everywhere in this API, so the contract calls these folders; the table keeps its name
-- because a rename is a migration for no behaviour.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;

-- The card's folder. Nullable: most copies are in none. The `on delete` behaviour of the
-- constraint the web app made is not recorded anywhere, which is why the API empties a folder
-- explicitly before deleting it (lib/storage/postgres.ts, deleteFolder).
alter table public.cards add column if not exists collection_id uuid references public.collections (id);

-- The anonymous role reads the public columns of `cards` and nothing else. The web app's schema
-- review narrowed it to these (measured column by column on 2026-09-02); the API's public routes
-- read as the service role, scoped to one public profile, and forPublic() strips the rest.
-- Re-granting is a no-op where the grant exists.
grant select (id, name, number, set_name, rarity, gen, types, owned, finish, quantity, image_url, tcg_id, wishlist, user_id)
  on public.cards to anon;

comment on column public.cards.collection_id is 'The folder this copy is filed in (/v1/folders), or null.';
