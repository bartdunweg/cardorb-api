-- What kind of card each copied card is, and whether it is a full art.
--
-- Full art means the illustration covers the whole card instead of sitting in a frame
-- (Bulbapedia, "Full Art card (TCG)"). No catalogue records it, and the rarity cannot answer it
-- on its own: "Ultra Rare" is the full art ex in Scarlet & Violet, the full art V in Sword &
-- Shield, and the *plain* GX in Sun & Moon, whose full arts are that set's Secret Rares.
--
-- What holds in every era is that a full art is a reprint: the same name appears a second time,
-- later in the same set, with the art let out to the edges. That is what the backfill below
-- works out, and what the nightly copy writes from then on (lib/core/catalogue/full-art.ts).
--
-- Gold is not full art, it has golden borders. At the two ambiguous rarities a Supporter is the
-- full art reprint and an Item, Tool or Stadium is the gold one, which is why trainer_type is
-- copied in beside category.
--
-- Safe before and after the code that fills it: the columns default to null and false, the copy
-- writes them on its next pass, and the backfill makes the copy right now without waiting for it.

alter table public.catalogue_cards
  add column if not exists category text,
  add column if not exists trainer_type text,
  add column if not exists full_art boolean not null default false;

comment on column public.catalogue_cards.category is
  'TCGdex''s category: Pokemon, Trainer or Energy. Null where the record did not say.';
comment on column public.catalogue_cards.trainer_type is
  'For a trainer, which kind: Supporter, Item, Tool, Stadium. Null for anything else.';
comment on column public.catalogue_cards.full_art is
  'The illustration covers the whole card. Worked out per set: see lib/core/catalogue/full-art.ts.';

-- The filter reads "the full arts, newest set first", so the index carries the order with it.
create index if not exists catalogue_cards_full_art_idx
  on public.catalogue_cards (release_date desc nulls last, set_id, local_id)
  where full_art;

-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- The same rule in SQL, so the copy is right the moment this runs rather than after a full
-- pass of the cron (which is a quarter of an hour and every set re-read). category and
-- trainer_type stay null until that pass, so the gold items of Sun & Moon and Sword & Shield
-- come along for now; the next copy drops them.

with numbered as (
  select
    id,
    set_id,
    lower(name) as name,
    lower(coalesce(rarity, '')) as rarity,
    nullif(regexp_replace(local_id, '\D', '', 'g'), '')::bigint as num
  from public.catalogue_cards
),
first_print as (
  select set_id, name, min(num) as first_num
  from numbered
  where num is not null
  group by set_id, name
)
update public.catalogue_cards c
set full_art = true
from numbered n
  left join first_print f on f.set_id = n.set_id and f.name = n.name
where c.id = n.id
  and (
    n.rarity in (
      'illustration rare', 'special illustration rare', 'shiny ultra rare', 'shiny rare',
      'full art trainer', 'black white rare', 'crown', 'amazing rare'
    )
    or (n.rarity in ('ultra rare', 'secret rare') and n.num is not null and f.first_num < n.num)
  )
  and c.full_art is distinct from true;
