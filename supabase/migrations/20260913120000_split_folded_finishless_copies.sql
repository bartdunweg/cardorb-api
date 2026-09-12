-- Seven cards that fold_card made one of two, and the Pansear that a renumbering made two of one.
--
-- The Notion import of 2026-08-14 left `finish` empty on some rows whose Notion page said
-- Non-holo, Reversed Holo or Holo. Two pages of one card (a Non-holo and a Reversed Holo of
-- Tepig, White Flare 011) became two rows that differed in nothing the store compares, and the
-- fold of 2026-09-11 (20260911150000_fold_identical_cards.sql) made them one row of 2. The
-- collection has read "Tepig ×2, finish not recorded" since, where the shelf holds one normal
-- and one reverse holo. Each pair below was read back from its two Notion pages on 2026-09-13:
-- the kept row carries the first page's id as source_id, and the finish that page names; the
-- row written here carries the folded page's id and its finish.
--
-- Pansear, White Flare 014: Notion held a Non-holo and a Reversed Holo at 013 as well as at 014,
-- and 013 in White Flare is Emboar. The 013 pages were a second entry of the same two cards; a
-- number repair moved them onto 014 and the fold added them to the real ones. The owner holds
-- one of each (2026-09-13), so both rows go back to 1.
--
-- The three Special Illustration Rares with no finish are holo: that rarity is printed as a holo
-- and nothing else.
--
-- Every statement names its row by id and by the state it is in today (a quantity of 2 and no
-- finish), so a row the owner has changed since is left alone rather than overwritten, and a
-- second run does nothing. The writes move profiles.cards_version through its triggers, so the
-- cached rows are read again.

with pairs (kept_id, kept_finish, folded_source_id, folded_finish) as (
  values
    ('30e317a1-5d16-4b4b-b8a9-dfbd7dd85a8e'::uuid, 'normal', '872e9c5b-9b62-423c-996b-a48100640620', 'reverse-holo'), -- Charmander, 151 004
    ('409eb80d-172a-4e10-81bb-20d0f64c86a8'::uuid, 'normal', '27bf63be-3347-46ff-a6a7-51802c044865', 'reverse-holo'), -- Charmeleon, 151 005
    ('04c82832-f790-4468-85b3-e0412e8330d3'::uuid, 'reverse-holo', '2435c873-e817-81bf-96f5-d48087e4443e', 'normal'), -- Snivy, Black Bolt 001
    ('3913ac6c-1099-4593-84cc-b9500ed24c49'::uuid, 'reverse-holo', '2435c873-e817-8169-96ba-e0225e07462c', 'holo'), -- Victini, Black Bolt 012
    ('2872d96e-5e93-4c31-8058-85c6cd6336f7'::uuid, 'normal', '2435c873-e817-81ce-b71a-faba089d86ef', 'reverse-holo'), -- Tepig, White Flare 011
    ('db7dd015-9c4d-450e-b1a9-7b5f803a4a4f'::uuid, 'normal', '2435c873-e817-8175-8147-ea2e4f1cde29', 'reverse-holo'), -- Emboar, White Flare 013
    ('0fe8aeca-07c0-4f17-9c44-de7bd6c8093d'::uuid, 'reverse-holo', '2435c873-e817-813e-80b9-ed3ce919d5bf', 'normal') -- Oshawott, White Flare 021
),
todo as (
  select
    p.kept_id, p.kept_finish, p.folded_source_id, p.folded_finish,
    c.user_id, c.name, c.number, c.set_name, c.rarity, c.gen, c.types, c.owned, c.excluded,
    c.acquired_at, c.source, c.condition, c.grade, c.purchase_price, c.purchase_date, c.notes,
    c.is_favorite, c.image_url, c.image_high_url, c.tcg_id, c.collection_id, c.language,
    c.foil_pattern, c.edition
  from pairs p
  join public.cards c on c.id = p.kept_id
  where c.quantity = 2 and c.finish is null
),
written as (
  insert into public.cards (
    user_id, name, number, set_name, rarity, gen, types, owned, excluded, acquired_at,
    source, source_id, quantity, condition, grade, purchase_price, purchase_date, notes,
    is_favorite, finish, image_url, image_high_url, tcg_id, collection_id, language,
    foil_pattern, edition, dex_face
  )
  select
    user_id, name, number, set_name, rarity, gen, types, owned, excluded, acquired_at,
    source, folded_source_id, 1, condition, grade, purchase_price, purchase_date, notes,
    is_favorite, folded_finish, image_url, image_high_url, tcg_id, collection_id, language,
    foil_pattern, edition, false
  from todo
  returning id
)
update public.cards c
  set finish = t.kept_finish,
      quantity = 1,
      updated_at = now()
  from todo t
  where c.id = t.kept_id;

-- Pansear, White Flare 014: one normal, one reverse holo.
update public.cards
  set quantity = 1,
      updated_at = now()
  where id in ('3e851d37-1580-44f3-b99e-a3f689bf314f', '7fb27729-568d-4544-90d8-45394b53b130')
    and quantity = 2;

-- Marnie's Grimmsnarl ex, Cinccino ex, Morpeko ex: Special Illustration Rares, printed holo.
update public.cards
  set finish = 'holo',
      updated_at = now()
  where id in (
      '9a841f9f-ff13-423b-8996-3699ef10344e',
      'c55f8e77-51e7-4f9a-b379-15a8803cbc34',
      '6687ec93-0f40-44f0-b38a-199ae9971d3a'
    )
    and finish is null;
