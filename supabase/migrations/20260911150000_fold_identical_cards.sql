-- Identical rows are one row.
--
-- The store kept a row per purchase, and #247 folded rows that agree on everything at read
-- time: four Holo · Near Mint copies read as one item of four, carrying the first row's id.
-- Every write still went to that one row. A sheet showing "4" that sent quantity 3 set the
-- first row to 3 and the other three rows still counted: 6. Every press of minus, and of plus,
-- added the hidden rows back. A condition changed on that item changed one row, and the rest
-- reappeared as a second item with the old condition.
--
-- So the fold happens in the store, once, and stays true: `fold_card` folds every row that is
-- the same card and the same kind as a given row into that row, and every write that can make
-- two rows identical (a copy, a split, a patch, an import) folds the row it wrote. Rows are
-- one per kind, and a quantity is the whole answer.
--
-- Same kind: what `sameness` in lib/core/collection/items.ts compares — owned, language,
-- finish, foil pattern, condition, grade, binder and the star — on the same card (name,
-- number, set, catalogue id). Not price, dates or notes: those are facts about a purchase,
-- and two copies you cannot tell apart on the shelf were already one line whatever each cost.
-- The row kept keeps its own; where it has none, it takes the first the folded rows had, so a
-- note is not lost to the fold.
--
-- Run once below for every row there is, keeping the oldest of each group. Fomantis on
-- 2026-09-11 was three rows reading 11; it becomes one.

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
      name, number, set_name, tcg_id, owned, language, finish, foil_pattern, condition, grade,
      collection_id, is_favorite
    ) id
    from public.cards
    where user_id = p_user_id
    order by
      name, number, set_name, tcg_id, owned, language, finish, foil_pattern, condition, grade,
      collection_id, is_favorite, created_at, id
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
  v_condition := case when p_changes ? 'condition' then p_changes->>'condition' else src.condition end;
  v_grade := case when p_changes ? 'grade' then p_changes->>'grade' else src.grade end;
  v_language := case when p_changes ? 'language' then p_changes->>'language' else src.language end;
  v_folder := case when p_changes ? 'collectionId' then (p_changes->>'collectionId')::uuid else src.collection_id end;

  -- Copies that come out the same kind as this row (a note, a price, a date, or a value the
  -- row already has) would fold straight back into it. That is not a split; it is this row.
  if v_finish is not distinct from src.finish
    and v_pattern is not distinct from src.foil_pattern
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
    finish, foil_pattern, quantity, condition, grade, language, purchase_price, purchase_date, notes,
    is_favorite, collection_id, source
  ) values (
    src.user_id, src.name, src.number, src.set_name, src.rarity, src.gen, src.types, src.tcg_id,
    src.owned, src.excluded,
    case when p_changes ? 'acquiredAt' then (p_changes->>'acquiredAt')::timestamptz else src.acquired_at end,
    v_finish, v_pattern, p_count, v_condition, v_grade, v_language,
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

-- Once, for everything already there.
do $$
declare
  u record;
begin
  for u in select distinct user_id from public.cards loop
    perform public.fold_identical_cards(u.user_id);
  end loop;
end;
$$;
