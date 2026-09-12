-- A copy's edition: which print run it is from.
--
-- The classics were printed more than once and the runs are not the same card to a collector.
-- Base Set went out as 1st Edition (an "EDITION 1" stamp), then Shadowless (no drop shadow on
-- the art box), then Unlimited; Jungle, Fossil, Team Rocket, Gym and Neo each had a 1st Edition
-- run. A 1st Edition Lugia is $1,085 where an unlimited one is $519, so a collection that
-- cannot say which it holds cannot say what it is worth. The owner asked for it on 2026-09-12.
--
-- A third axis beside finish and foil pattern, not a widening of either. `finish` answers which
-- price series a copy reads and the value history is built on it; `foil_pattern` is what the foil
-- looks like. An edition is neither: it is when the card was printed, and a 1st Edition holo is
-- still a holo. Three values, and null for the rows that have never said (every row today):
--
--   1st-edition  the stamped first run
--   shadowless   Base Set's second run, no drop shadow. No catalogue knows this one; it comes
--                from the person holding the card.
--   unlimited    the ordinary run, said out loud
--
-- Null is not "unlimited". Most of what anybody owns is unlimited, and guessing that for 1,937
-- rows nobody has looked at would put a fact in the database that nobody established. A row
-- says unlimited when somebody says so.
--
-- Safe before and after: the column is nullable with no default, so a deployment that does not
-- know about it writes and reads exactly what it did. The three functions below gain one
-- comparison each, which for null-on-both-sides is what they already did.

alter table public.cards add column if not exists edition text;

comment on column public.cards.edition is
  'Which print run a copy is from: 1st-edition, shadowless, unlimited. Null where nobody has said; not a synonym for unlimited.';

alter table public.cards drop constraint if exists cards_edition_check;
alter table public.cards add constraint cards_edition_check
  check (edition is null or edition = any (array['1st-edition'::text, 'shadowless'::text, 'unlimited'::text]));

-- Same kind, and now the edition too: a 1st Edition copy is not one more of the unlimited row.
-- Every field below is what `sameness` in lib/core/collection/items.ts compares.
create or replace function public.fold_card(p_id uuid, p_user_id uuid)
returns setof public.cards
language plpgsql
security invoker
as $$
declare
  keep public.cards%rowtype;
  gone record;
begin
  select * into keep from public.cards
    where id = p_id and user_id = p_user_id
    for update;
  if not found then
    return;
  end if;

  select
    coalesce(sum(case when c.owned then greatest(c.quantity, 1) else 0 end), 0)::integer as quantity,
    (array_agg(c.notes order by c.created_at) filter (where c.notes is not null))[1] as notes,
    (array_agg(c.purchase_price order by c.created_at) filter (where c.purchase_price is not null))[1] as purchase_price,
    (array_agg(c.purchase_date order by c.created_at) filter (where c.purchase_date is not null))[1] as purchase_date,
    min(c.acquired_at) as acquired_at,
    count(*) as n
  into gone
  from public.cards c
  where c.user_id = p_user_id
    and c.id <> keep.id
    and c.name = keep.name
    and c.number = keep.number
    and c.set_name = keep.set_name
    and c.tcg_id is not distinct from keep.tcg_id
    and c.owned = keep.owned
    and c.language is not distinct from keep.language
    and c.finish is not distinct from keep.finish
    and c.foil_pattern is not distinct from keep.foil_pattern
    and c.edition is not distinct from keep.edition
    and c.condition is not distinct from keep.condition
    and c.grade is not distinct from keep.grade
    and c.collection_id is not distinct from keep.collection_id
    and c.is_favorite = keep.is_favorite;

  if gone.n > 0 then
    delete from public.cards c
    where c.user_id = p_user_id
      and c.id <> keep.id
      and c.name = keep.name
      and c.number = keep.number
      and c.set_name = keep.set_name
      and c.tcg_id is not distinct from keep.tcg_id
      and c.owned = keep.owned
      and c.language is not distinct from keep.language
      and c.finish is not distinct from keep.finish
      and c.foil_pattern is not distinct from keep.foil_pattern
      and c.edition is not distinct from keep.edition
      and c.condition is not distinct from keep.condition
      and c.grade is not distinct from keep.grade
      and c.collection_id is not distinct from keep.collection_id
      and c.is_favorite = keep.is_favorite;

    update public.cards
      set quantity = case when keep.owned then greatest(keep.quantity, 1) + gone.quantity else keep.quantity end,
          notes = coalesce(keep.notes, gone.notes),
          purchase_price = coalesce(keep.purchase_price, gone.purchase_price),
          purchase_date = coalesce(keep.purchase_date, gone.purchase_date),
          -- The earliest pull: a card first held in 2019 was not pulled today because its
          -- fourth copy was.
          acquired_at = least(keep.acquired_at, gone.acquired_at),
          updated_at = now()
      where id = keep.id;
  end if;

  return query select * from public.cards where id = keep.id;
end;
$$;

-- Every group of one person's rows, the oldest row of each kept. Returns how many rows went.
create or replace function public.fold_identical_cards(p_user_id uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  before integer;
  after integer;
  r record;
begin
  select count(*) into before from public.cards where user_id = p_user_id;
  for r in
    select distinct on (
      name, number, set_name, tcg_id, owned, language, finish, foil_pattern, edition, condition,
      grade, collection_id, is_favorite
    ) id
    from public.cards
    where user_id = p_user_id
    order by
      name, number, set_name, tcg_id, owned, language, finish, foil_pattern, edition, condition,
      grade, collection_id, is_favorite, created_at, id
  loop
    perform public.fold_card(r.id, p_user_id);
  end loop;
  select count(*) into after from public.cards where user_id = p_user_id;
  return before - after;
end;
$$;

-- A split whose copies come out the same as a row already held is one more of that row.
create or replace function public.split_card(
  p_id uuid,
  p_user_id uuid,
  p_count integer,
  p_changes jsonb
) returns setof public.cards
language plpgsql
security invoker
as $$
declare
  src public.cards%rowtype;
  new_id uuid;
  v_finish text;
  v_pattern text;
  v_edition text;
  v_condition text;
  v_grade text;
  v_language text;
  v_folder uuid;
begin
  select * into src from public.cards
    where id = p_id and user_id = p_user_id
    for update;
  if not found then
    return;
  end if;
  if p_count < 1 or p_count >= src.quantity then
    raise exception 'split-count' using errcode = 'check_violation';
  end if;

  v_finish := case when p_changes ? 'finish' then p_changes->>'finish' else src.finish end;
  v_pattern := case when p_changes ? 'foilPattern' then p_changes->>'foilPattern' else src.foil_pattern end;
  v_edition := case when p_changes ? 'edition' then p_changes->>'edition' else src.edition end;
  v_condition := case when p_changes ? 'condition' then p_changes->>'condition' else src.condition end;
  v_grade := case when p_changes ? 'grade' then p_changes->>'grade' else src.grade end;
  v_language := case when p_changes ? 'language' then p_changes->>'language' else src.language end;
  v_folder := case when p_changes ? 'collectionId' then (p_changes->>'collectionId')::uuid else src.collection_id end;

  -- Copies that come out the same kind as this row (a note, a price, a date, or a value the
  -- row already has) would fold straight back into it. That is not a split; it is this row.
  if v_finish is not distinct from src.finish
    and v_pattern is not distinct from src.foil_pattern
    and v_edition is not distinct from src.edition
    and v_condition is not distinct from src.condition
    and v_grade is not distinct from src.grade
    and v_language is not distinct from src.language
    and v_folder is not distinct from src.collection_id then
    raise exception 'split-same' using errcode = 'check_violation';
  end if;

  update public.cards
    set quantity = quantity - p_count, updated_at = now()
    where id = p_id;

  insert into public.cards (
    user_id, name, number, set_name, rarity, gen, types, tcg_id, owned, excluded, acquired_at,
    finish, foil_pattern, edition, quantity, condition, grade, language, purchase_price,
    purchase_date, notes, is_favorite, collection_id, source
  ) values (
    src.user_id, src.name, src.number, src.set_name, src.rarity, src.gen, src.types, src.tcg_id,
    src.owned, src.excluded,
    case when p_changes ? 'acquiredAt' then (p_changes->>'acquiredAt')::timestamptz else src.acquired_at end,
    v_finish, v_pattern, v_edition, p_count, v_condition, v_grade, v_language,
    case when p_changes ? 'purchasePrice' then (p_changes->>'purchasePrice')::numeric else src.purchase_price end,
    case when p_changes ? 'purchaseDate' then (p_changes->>'purchaseDate')::date else src.purchase_date end,
    case when p_changes ? 'notes' then p_changes->>'notes' else src.notes end,
    src.is_favorite, v_folder, 'manual'
  )
  returning id into new_id;

  return query select * from public.fold_card(new_id, p_user_id);
  return query select * from public.cards where id = p_id;
end;
$$;
