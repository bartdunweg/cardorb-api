-- A folder may be shown on its owner's public profile. Off by default, like the profile itself:
-- sharing is something you do. Read for a visitor through the service role, scoped to the one
-- owner and to is_public rows (src/lib/core/collection/collection.ts getPublicFolders), so no
-- policy on this table widens; the policies stay "your own rows".
alter table public.collections add column if not exists is_public boolean not null default false;
comment on column public.collections.is_public is
  'Shown on the owner''s public profile, as a filter over the public cards. Only while the profile itself is public.';
