-- Two rows of one card fold whichever way each spells its number.
--
-- The catalogue copy writes a number as the card prints it from CATALOGUE_FORMAT 5 on (001 for Sword &
-- Shield, Celebrations, the 2023 and 2024 McDonald's collections and the Nintendo promos, where TCGdex
-- writes 1), and a row keeps the number it was added with. So a copy added from a set page before the
-- night copied its set again says 1, and one added after says 001: the same card, the same catalogue
-- id, and fold_card compared the number exactly and kept them two rows.
--
-- card_number_key() is canonNumber() in src/lib/core/card-number.mjs as SQL, and
-- src/lib/storage/card-number-key.test.ts runs both over one list: the digits without their padding
-- (001 is 1), in lower case (77a is 77A), without a promo set's letters (SWSH020 is 020, as the
-- collection stores it), and every other letter in its place (TG01 is not 1, 60a is not 60). A number
-- with no digits is itself, in lower case.
--
-- fold_card is otherwise as 20260912100000_card_edition.sql wrote it: every other field it compares is
-- unchanged, the catalogue id among them, so a number spelt another way is only ever folded into a row
-- of the very same card. No row is written here; the next write to a card folds it as before.

create or replace function public.card_number_key(n text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when m is null then lower(t)
    else lower(m[1] || coalesce(nullif(ltrim(m[2], '0'), ''), '0') || m[3])
  end
  from (
    select t, regexp_match(
      regexp_replace(t, '^(HGSS|SWSH|SVP|XY|SM|BW|DP)(?=[0-9])', '', 'i'),
      '^([A-Za-z]*)([0-9]+)(.*)$'
    ) as m
    from (select btrim(coalesce(n, ''), E' \t\r\n') as t) trimmed
  ) parsed
$$;

comment on function public.card_number_key(text) is
  'A card number folded the way canonNumber() in the API folds it: 001 is 1, SWSH020 is 020, TG01 stays tg1.';

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
    and public.card_number_key(c.number) = public.card_number_key(keep.number)
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
      and public.card_number_key(c.number) = public.card_number_key(keep.number)
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
