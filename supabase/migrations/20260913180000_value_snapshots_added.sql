-- What each point of the Home line gained by holding more rather than by prices moving: the copies
-- added since the point before, and what they were worth that day. A chart marks the day, and a
-- total says which part of a change was adding cards (Bart, 2026-09-13). Zero for the points
-- written before, until the history is rebuilt (snapshot cron, `?history=1`).
alter table public.collection_value_snapshots
  add column if not exists added_cards integer not null default 0,
  add column if not exists added_value_cents bigint not null default 0;
