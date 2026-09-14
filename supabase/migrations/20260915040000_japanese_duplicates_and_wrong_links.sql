-- sm2+ is SM2p, Beyond a New Challenge, a second time. TCGdex lists the set under both ids, SM2p with
-- its 65 cards and sm2+ with none, and the Japanese copy built sm2+ out of TCGplayer's "SM2+: Facing
-- a New Trial" group, which SM2p did not claim because neither its code nor its English title
-- found that group: 66 cards held twice, with 373 months of price history under the sm2+ ids
-- (2026-09-14). tcgplayer-japan.ts now names that group for SM2p by hand, so the copy no longer
-- builds sm2+, and no row in cards points at an sm2+ id (checked 2026-09-14: 0 rows).
delete from public.card_price_months where tcg_id like 'sm2+-%';
delete from public.catalogue_cards where language = 'ja' and set_id = 'sm2+';
delete from public.catalogue_sync where language = 'ja' and set_id = 'sm2+';
delete from public.catalogue_sets where language = 'ja' and id = 'sm2+';

-- Japanese cards carried another card's TCGplayer product, and with it that card's price
-- history (Japanese links audit, 2026-09-14): SM10-026 Krabby read Kingler (TCGplayer numbers both
-- 026/095), SM10-089 Martial Arts Dojo read Dust Island (both 089/095), neo2-039 Houndour (U) read
-- Houndour (HR), and three trainers matched a Pokémon by a species the old name rules gave them:
-- neo4-106 Lucky Stadium as Chansey, neo2-054 as Kabuto, PMCG1-091 Clefairy Doll as Clefairy. The
-- copy now links the right product or none; the readings that were another card's go, and the
-- nightly price job writes the right ones from here. neo4-106 is left out: card_price_months has no
-- language, the id is English Shining Celebi too, and its Japanese reading went in 20260915010000;
-- what is left under it (1st Edition and Unlimited holofoil) is the English card's.
delete from public.card_price_months
where tcg_id in ('SM10-026', 'SM10-089', 'neo2-039', 'neo2-054', 'PMCG1-091');
