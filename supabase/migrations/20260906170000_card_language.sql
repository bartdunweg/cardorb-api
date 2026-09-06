-- The language a copy is printed in. Cards come in many; Cardmarket lists a
-- copy's language beside its condition, and a Japanese and an English printing
-- of one card are two rows here, the way two conditions are.
--
-- Nullable, like condition: a row written before today, or a card added
-- without saying, reads as "not recorded", which the apps show as English, the
-- language nearly every card here is. Two-letter codes as Cardmarket and
-- TCGdex use them; the API refuses anything outside its list.
alter table public.cards
  add column if not exists language text check (length(language) <= 5);
