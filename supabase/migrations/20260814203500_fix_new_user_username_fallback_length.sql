-- handle_new_user()'s fallback username overflowed username_shape.
--
-- 'u' || replace(new.id::text, '-', '') is 33 characters (1 + 32 hex), and
-- username_shape allows at most 30 (`^[a-z0-9][a-z0-9-]{1,29}$`). Any account
-- created without a `username` in raw_user_meta_data hit this fallback and
-- failed the whole insert into auth.users, because the trigger runs inside
-- that same transaction. The web sign-up route (app/api/v1/signup/route.ts)
-- always supplies a username, so it never hit this. The iOS app signs up
-- directly through the Supabase SDK with no metadata at all, so every iOS
-- sign-up has been failing outright since this trigger shipped.
--
-- Truncated to 29 hex characters after the 'u' so the total is exactly 30,
-- the constraint's own ceiling. 29 hex characters (~116 bits) makes a
-- collision practically impossible, and a collision is not silent either way:
-- the profile's username is unique, so a clash fails the insert with 23505
-- rather than handing two people the same name.
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
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'u' || substring(replace(new.id::text, '-', '') from 1 for 29)
    ),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
