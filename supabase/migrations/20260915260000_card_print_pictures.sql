-- A picture of each printing TCGplayer sells as a product of its own (Bart, 2026-09-15): the Poke
-- Ball and Master Ball reverses, a Japanese card's mirror holo, a cosmos holo. The nightly
-- print-pictures job copies each product's photo into our bucket and writes its address here; the
-- card route hands each printing its picture (print-pictures.ts). A few thousand short rows.
create table if not exists public.card_print_pictures (
  language text not null check (language in ('en', 'ja')),
  card_id text not null,
  -- The printing: a finish, and its foil pattern after a slash where it has one ("holo/cosmos").
  print text not null,
  product_id integer not null,
  -- Always a file in our bucket (images.cardorb.com).
  image text not null,
  copied_at timestamptz not null default now(),
  primary key (language, card_id, print)
);

comment on table public.card_print_pictures is 'A picture per printing TCGplayer sells as its own product, copied to our bucket by the nightly print-pictures cron.';

-- Read and written by the service role only, like catalogue_sets: no grant to anon or authenticated.
alter table public.card_print_pictures enable row level security;
