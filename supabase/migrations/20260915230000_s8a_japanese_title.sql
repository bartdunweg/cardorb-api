-- S8a's Japanese title as the pack and pokemon-card.com print it, "25th ANNIVERSARY COLLECTION",
-- where TCGdex wrote 25th アニバーサリーコレクション (2026-09-15; Bulbapedia agrees with the pack).
-- set-corrections.ts writes the same from the next copy of the set; this puts the stored row right
-- now. Guarded on the old value, so a second run changes nothing.
update public.catalogue_sets
set local_name = '25th ANNIVERSARY COLLECTION'
where language = 'ja' and id = 'S8a' and local_name = '25th アニバーサリーコレクション';
