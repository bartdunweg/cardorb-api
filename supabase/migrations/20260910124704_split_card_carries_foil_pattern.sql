-- `split_card` predates the foil_pattern column and never learned about it.
--
-- Splitting some copies off a row dropped what the foil looks like: the source kept its Cosmos
-- and the new row had none, on a field the API accepts and the card sheet shows. Nothing failed;
-- the pattern was simply gone, and null in this schema means "nobody has said" rather than
-- "plain", so a stated fact became a missing one.
--
-- Everything else here is the function as it was.

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
    finish, foil_pattern, quantity, condition, grade, language, purchase_price, purchase_date, notes,
    is_favorite, collection_id, source
  ) values (
    src.user_id, src.name, src.number, src.set_name, src.rarity, src.gen, src.types,
    src.owned, src.excluded,
    case when p_changes ? 'acquiredAt' then (p_changes->>'acquiredAt')::timestamptz else src.acquired_at end,
    case when p_changes ? 'finish' then p_changes->>'finish' else src.finish end,
    case when p_changes ? 'foilPattern' then p_changes->>'foilPattern' else src.foil_pattern end,
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
