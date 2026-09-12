-- A promo's number is stored without its promo set's letters, and the database refuses one that
-- is not.
--
-- Venusaur EX, XY Black Star Promos, sat at the bottom of its binder under Pikachu EX 124. Its
-- row said XY123 where every other XY promo row says the bare number (110, 122, 124, 67A). The
-- collection audit of 2026-08-16 wrote TCGdex's localId straight to Postgres, and the sort read
-- XY123 as no number at all. The code now sorts XY123 as 123 and writes every number through
-- storedCardNumber() (src/lib/core/util.ts), but a script can still reach this table without
-- the code, which is what happened. So the table says it too.
--
-- The prefixes are the ones util.ts's PROMO_PREFIXES lists, for the reason it gives: each is the
-- letters every card of one TCGdex promo set carries (xyp, smp, swshp, bwp, dpp, hgssp; SVP for
-- pokemontcg.io's svp), followed by a digit. A gallery prefix (TG01, GG01, RC5, SV49) is a
-- different card from 1 and stays. The two lists change together or not at all.
--
-- Generic, not one id: every row that carries a promo prefix loses it, and the suffix letter is
-- upper-cased as the collection writes it (XY67a is 67A). On 2026-09-12 that is exactly one row.
-- The update moves profiles.cards_version through its trigger, so the cached rows are read again.

update public.cards
  set number = upper(regexp_replace(btrim(number), '^(HGSS|SWSH|SVP|XY|SM|BW|DP)(?=[0-9])', '', 'i')),
      updated_at = now()
  where btrim(number) ~* '^(HGSS|SWSH|SVP|XY|SM|BW|DP)[0-9]';

alter table public.cards drop constraint if exists cards_number_no_promo_prefix;
alter table public.cards add constraint cards_number_no_promo_prefix
  check (btrim(number) !~* '^(HGSS|SWSH|SVP|XY|SM|BW|DP)[0-9]');

comment on constraint cards_number_no_promo_prefix on public.cards is
  'A promo is stored as the number it wraps (XY123 is 123), like its siblings; see storedCardNumber() in the API.';
