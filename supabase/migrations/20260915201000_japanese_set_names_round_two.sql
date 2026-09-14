-- Japanese set titles put right today, from set-corrections.ts, which every nightly write applies from
-- now on (naming pass, 2026-09-14): where Bulbapedia and Scrydex agree against TCGdex's own English
-- translation. A card of the copy carries its set's title too (catalogue_cards.set_name), and a
-- collection reads a set by that title, so both move together. No collection row holds a Japanese
-- set title today.
create temporary table japanese_set_titles (id text primary key, name text not null);
insert into japanese_set_titles (id, name) values
  ('SM2p', 'Facing a New Trial'),
  ('sm2+', 'Facing a New Trial'),
  ('PCG7', 'Holon Phantom'),
  ('CP4', 'Premium Champion Pack'),
  ('XY11a', 'Fever-Burst Fighter'),
  ('SM0', 'Pikachu''s New Friends'),
  ('SM7', 'Sky-Splitting Charisma'),
  ('S5a', 'Peerless Fighters'),
  ('neo1', 'Gold, Silver, to a New World...'),
  ('neo2', 'Crossing the Ruins...'),
  ('neo4', 'Darkness, and to Light...'),
  ('M2a', 'MEGA Dream ex'),
  -- The set's row had this since 20260915025000; its cards still carried TCGdex's "Expansion Pack".
  ('ADV1', 'ADV Expansion Pack');

update public.catalogue_sets s
set name = t.name
from japanese_set_titles t
where s.language = 'ja' and s.id = t.id and s.name is distinct from t.name;

update public.catalogue_cards c
set set_name = t.name
from japanese_set_titles t
where c.language = 'ja' and c.set_id = t.id and c.set_name is distinct from t.name;
