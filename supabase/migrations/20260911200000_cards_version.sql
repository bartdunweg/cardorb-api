-- A cache of the rows that cannot be filled with rows from before a write.
--
-- The rows are cached an hour under a tag, and every write drops the tag. That is a race: a
-- read that started before the write finishes after it, and stores what it read — the rows
-- from before — under a tag that was dropped a moment earlier. Two presses on a count within a
-- second did exactly that (cardorb-web #360): the sheet said 2 and the list said 4, for an
-- hour or until the next write. Dropping a tag says "what you hold is old"; it cannot say
-- "what you are about to store is old too".
--
-- A version can. Every write to a person's cards moves their `cards_version`, and the rows
-- cache is keyed on it: a read that started before the write stores under the old version,
-- where nothing will look again, and the next read asks the store for the version, sees a new
-- one, and misses. The version is one integer read before the rows, off the profile row the
-- request reads anyway.
--
-- One increment per statement, not per row: an import of a thousand rows is one write to one
-- profile, not a thousand.

alter table public.profiles
  add column if not exists cards_version bigint not null default 0;

-- Security definer: the update goes to the writer's own profile, which their policy allows,
-- but the cascade of a deleted account and the service role's writes hold no auth.uid() to
-- pass it, and the version must move for those too.
create or replace function public.bump_cards_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One branch per operation: a transition table only exists for the statement that names
  -- it, and plpgsql plans a statement the first time it runs, so the branch not taken is
  -- never asked for a table it does not have.
  if tg_op = 'INSERT' then
    update public.profiles p set cards_version = p.cards_version + 1
     where p.id in (select user_id from new_rows);
  elsif tg_op = 'DELETE' then
    update public.profiles p set cards_version = p.cards_version + 1
     where p.id in (select user_id from old_rows);
  else
    update public.profiles p set cards_version = p.cards_version + 1
     where p.id in (select user_id from new_rows union select user_id from old_rows);
  end if;
  return null;
end;
$$;

revoke all on function public.bump_cards_version() from public;

drop trigger if exists cards_version_on_insert on public.cards;
create trigger cards_version_on_insert
  after insert on public.cards
  referencing new table as new_rows
  for each statement execute function public.bump_cards_version();

drop trigger if exists cards_version_on_update on public.cards;
create trigger cards_version_on_update
  after update on public.cards
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.bump_cards_version();

drop trigger if exists cards_version_on_delete on public.cards;
create trigger cards_version_on_delete
  after delete on public.cards
  referencing old table as old_rows
  for each statement execute function public.bump_cards_version();
