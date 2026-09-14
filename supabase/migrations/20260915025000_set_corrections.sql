-- Set facts put right today, from set-corrections.ts, which every nightly write applies from now on
-- (sets audit, 2026-09-14): two Japanese names that were other sets', nine release dates TCGplayer
-- and Scrydex agree against TCGdex on, and two names.
update public.catalogue_sets set local_name = '幻・伝説ドリームキラコレクション' where language = 'ja' and id = 'CP5';
update public.catalogue_sets set local_name = 'シャイニートレジャーex' where language = 'ja' and id = 'SV4a';
update public.catalogue_sets set release_date = '2014/06/14' where language = 'ja' and id = 'XY3';
update public.catalogue_sets set release_date = '2018/07/06' where language = 'ja' and id = 'SM7a';
update public.catalogue_sets set release_date = '2018/11/02' where language = 'ja' and id = 'SM8b';
update public.catalogue_sets set name = 'ADV Expansion Pack' where language = 'ja' and id = 'ADV1';
update public.catalogue_sets set release_date = '2019/04/05' where language = 'en' and id = 'det1';
update public.catalogue_sets set release_date = '2025/07/18' where language = 'en' and id = 'sv10.5w';
update public.catalogue_sets set release_date = '2025/07/18' where language = 'en' and id = 'sv10.5b';
update public.catalogue_sets set release_date = '2017/11/07' where language = 'en' and id = '2017sm';
update public.catalogue_sets set release_date = '2023/09/11' where language = 'en' and id = '2023sv';
update public.catalogue_sets set release_date = '2025/01/21' where language = 'en' and id = '2024sv';
update public.catalogue_sets set name = 'Best of Game' where language = 'en' and id = 'bog';

-- Red Flash wore Blue Shock's logo (Scrydex's xy8b_ja); cleared so the next Japanese run stores
-- xy8r_ja.
update public.catalogue_sets set logo = null where language = 'ja' and id = 'XY8b';
