-- The Notion integration is gone from the app; nothing writes or reads
-- public.connections anymore (it existed only to hold somebody's encrypted
-- Notion token — see the removed app/api/v1/connections/notion/route.ts and
-- app/api/v1/import/notion/route.ts). Row level security is on the table
-- being dropped, not something that outlives it, so the policy goes with it.
drop table if exists public.connections;
