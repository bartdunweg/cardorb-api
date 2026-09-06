-- One row holds N identical copies. When one of them turns out to be different
-- (Japanese, Near Mint, filed elsewhere), that copy needs a row of its own:
-- the source loses `p_count`, a sibling row is born with the same identity and
-- inventory, the differences from `p_changes` applied, and the source's
-- acquired_at kept, because the copy was pulled when the source was. One
-- function so the two writes are one transaction: a decrement without its
-- sibling, or the reverse, would lose or double a copy.
--
-- Security invoker: RLS on public.cards decides, as it does for every write.
-- Both ids are in the lookup so a stranger's row is "not found", never a hit.
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

  update public.cards
    set quantity = quantity - p_count, updated_at = now()
    where id = p_id;

  return query
  insert into public.cards (
    user_id, name, number, set_name, rarity, gen, types, owned, excluded, acquired_at,
    finish, quantity, condition, grade, language, purchase_price, purchase_date, notes,
    is_favorite, collection_id, source
  ) values (
    src.user_id, src.name, src.number, src.set_name, src.rarity, src.gen, src.types,
    src.owned, src.excluded,
    case when p_changes ? 'acquiredAt' then (p_changes->>'acquiredAt')::timestamptz else src.acquired_at end,
    case when p_changes ? 'finish' then p_changes->>'finish' else src.finish end,
    p_count,
    case when p_changes ? 'condition' then p_changes->>'condition' else src.condition end,
    case when p_changes ? 'grade' then p_changes->>'grade' else src.grade end,
    case when p_changes ? 'language' then p_changes->>'language' else src.language end,
    case when p_changes ? 'purchasePrice' then (p_changes->>'purchasePrice')::numeric else src.purchase_price end,
    case when p_changes ? 'purchaseDate' then (p_changes->>'purchaseDate')::date else src.purchase_date end,
    case when p_changes ? 'notes' then p_changes->>'notes' else src.notes end,
    src.is_favorite,
    case when p_changes ? 'collectionId' then (p_changes->>'collectionId')::uuid else src.collection_id end,
    'manual'
  )
  returning *;

  return query select * from public.cards where id = p_id;
end;
$$;

grant execute on function public.split_card(uuid, uuid, integer, jsonb) to authenticated;
