-- The import upserts on (user_id, source, source_id), and PostgREST names that
-- conflict target without a predicate. Postgres will only infer a *partial*
-- unique index when the statement repeats its WHERE clause, so the previous
-- index was unreachable from the client and every import died on "no unique or
-- exclusion constraint matching the ON CONFLICT specification".
--
-- Dropping the predicate costs nothing. A unique index already treats NULLs as
-- distinct, so a manually added card — source_id null — still cannot collide
-- with another one. The partial clause was saying something the index said
-- anyway, and saying it made the index untargetable.
drop index if exists public.cards_source_idx;

create unique index if not exists cards_source_idx
  on public.cards (user_id, source, source_id);
