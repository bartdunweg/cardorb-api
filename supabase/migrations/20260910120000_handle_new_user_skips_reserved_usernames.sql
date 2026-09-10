-- handle_new_user() would hand out a reserved username to anyone who asked.
--
-- The trigger takes the name straight from raw_user_meta_data, which is the
-- caller's own JSON, and the only check on it is username_shape. 'admin',
-- 'support', 'cardorb', 'official', 'billing' and 'security' all pass that
-- shape, and the seed list in 20260814062300 labels every one of them
-- 'impersonation'. Only claim_username() consulted the list, so the rule held
-- exactly where a name is changed later and nowhere at the door.
--
-- app/api/v1/signup/route.ts does check reserved_usernames before it calls
-- signUp, and that is why nothing has been taken. It is not the boundary: the
-- Supabase auth endpoint is reachable directly with the public anon key, which
-- both clients ship, so `signUp({ data: { username: 'security' } })` walked
-- past the route entirely and the trigger wrote the profile.
--
-- A reserved name falls through to the generated 'u…' name rather than raising.
-- The trigger runs inside the insert into auth.users, so raising fails the
-- signup itself, and the person on the other end of that is either somebody who
-- picked a name the app keeps back — the route already tells them so, in a form,
-- with a second chance — or an attacker, who learns nothing from a name that is
-- simply not theirs. Neither is worth a broken account creation, and the
-- 20260814203500 migration is the record of what a raising trigger costs: every
-- iOS signup failed outright for as long as its fallback overflowed.
--
-- Compared on text with lower() rather than by casting to citext: the function
-- carries `set search_path = ''`, so every name in it must be qualified, and the
-- schema citext was installed into is not something this file should have to
-- assert. reserved_usernames.name is citext, so the cast is the honest way to
-- ask for the case-insensitive match the column was chosen to give.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := nullif(new.raw_user_meta_data ->> 'username', '');
begin
  if wanted is not null and exists (
    select 1 from public.reserved_usernames r where lower(r.name::text) = lower(wanted)
  ) then
    wanted := null;
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      wanted,
      'u' || substring(replace(new.id::text, '-', '') from 1 for 29)
    ),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- create or replace keeps the function's privileges, so this changes nothing
-- today. It is here because the one role that fires this trigger is
-- supabase_auth_admin, it lost its EXECUTE once already, and every signup failed
-- for a day before anybody noticed. See 20260903055931.
grant execute on function public.handle_new_user() to supabase_auth_admin;
