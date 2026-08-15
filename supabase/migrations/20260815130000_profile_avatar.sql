-- A profile picture, stored rather than a link to somebody else's server.
--
-- profiles.avatar_url holds the public URL of a file in the new "avatars"
-- Storage bucket, not an arbitrary external URL: an avatar is user-uploaded
-- content, and letting the column hold any string would make it a place to
-- park a tracking pixel or a link the app's CSP has to trust. The upload
-- path (app/api/v1/profile/avatar) writes both the file and the column in
-- one request, so the two never point at different things.

alter table public.profiles
  add column if not exists avatar_url text;

-- One file per account, named by the account's own id so there is nothing
-- to look up and nothing for one person's upload to collide with another's:
-- storage.foldername(name)[1] is compared against auth.uid() directly by
-- every policy below, the same shape RLS already uses for "is this row
-- yours" elsewhere in this migration set.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read: an avatar is shown on /user/<name> to strangers by design,
-- the same as the profile row it belongs to.
create policy "avatars_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own" on storage.objects
  for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own" on storage.objects
  for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
