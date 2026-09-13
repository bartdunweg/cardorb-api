-- A copy you own has a finish.
--
-- `finish` was nullable and null meant "nobody has said". It said nothing useful: a copy with no
-- finish has no printing to price, and two copies that differ only in the finish nobody wrote
-- down are one kind to fold_card. That is how a normal and a reverse holo of seven cards became
-- one copy of two (20260913120000_split_folded_finishless_copies.sql).
--
-- So the API gives every owned copy it writes a finish when none was sent: the catalogue's only
-- printing where it has exactly one, normal otherwise (defaultFinish() in
-- src/lib/core/catalogue/default-finish.ts). This file is the floor under that: a write that
-- still arrives without one (a PATCH to null, a copy or split that says null, a wish marked
-- owned, a script) is given `normal` rather than refused, because refusing a card over a field
-- nobody chose loses the card. The check then says what is true of every row.
--
-- A wish (owned = false) keeps no finish: it is a card you want, and which printing is a choice
-- for the day it is bought.
--
-- Eevee, Wizards Black Star Promo 11, was one of the last two owned copies without a finish: it
-- is the Pokemon League holo (Bulbapedia, and its own Notion page read Rare Holo). Named by id
-- and by today's state, so a row changed since is left alone. The other, Spinarak from Perfect
-- Order, the owner removes by hand; if it is still there when this runs, the floor below makes
-- it normal.

update public.cards
  set finish = 'holo',
      updated_at = now()
  where id = 'c4a3064b-4b1f-4961-9577-0b7046f9e1aa'
    and finish is null;

create or replace function public.owned_copy_finish()
returns trigger
language plpgsql
as $$
begin
  if new.owned and new.finish is null then
    new.finish := 'normal';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_owned_copy_finish on public.cards;
create trigger cards_owned_copy_finish
  before insert or update on public.cards
  for each row
  execute function public.owned_copy_finish();

-- Every owned row still without a finish is given one before the check is added: holo for an
-- Illustration Rare or a Special Illustration Rare, which are printed as a holo and nothing else
-- (on 2026-09-13 that is one row, a Team Rocket's Nidoking ex in another collection), and the
-- same floor as the trigger for the rest.
update public.cards
  set finish = case when rarity ilike '%illustration rare%' then 'holo' else 'normal' end,
      updated_at = now()
  where owned and finish is null;

alter table public.cards drop constraint if exists cards_owned_has_finish;
alter table public.cards add constraint cards_owned_has_finish
  check (not owned or finish is not null);

comment on constraint cards_owned_has_finish on public.cards is
  'A copy you own has a finish; a wish may not. The API picks one (defaultFinish), the trigger cards_owned_copy_finish is the floor.';
