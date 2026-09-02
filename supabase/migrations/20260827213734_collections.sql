create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;

drop policy if exists collections_select on public.collections;
drop policy if exists collections_insert on public.collections;
drop policy if exists collections_update on public.collections;
drop policy if exists collections_delete on public.collections;

create policy collections_select on public.collections for select using (user_id = auth.uid());
create policy collections_insert on public.collections for insert to authenticated with check (user_id = auth.uid());
create policy collections_update on public.collections for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy collections_delete on public.collections for delete using (user_id = auth.uid());

alter table public.cards add column if not exists collection_id uuid references public.collections(id) on delete set null;
create index if not exists cards_collection_id_idx on public.cards(collection_id);;
