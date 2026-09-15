-- A row names a printing TCGplayer sells as a product of its own even where TCGplayer holds no picture
-- of it (Bart, 2026-09-15): the product proves the printing exists, and a Japanese card offers it as a
-- choice from here (print-pictures.ts, withProvenPrintings). Such a row has no image.
alter table public.card_print_pictures alter column image drop not null;
