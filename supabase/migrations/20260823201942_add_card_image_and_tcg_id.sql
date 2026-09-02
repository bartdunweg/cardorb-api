alter table public.cards
  add column if not exists image_url text,
  add column if not exists tcg_id text;;
