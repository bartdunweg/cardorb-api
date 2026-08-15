---
id: ADR-0021
title: Remove the Notion integration entirely
status: accepted
date: 2026-08-15
scope: repo
deciders: [Bart]
superseded-by: null
tags: [storage, migration]
---

# Remove the Notion integration entirely

## Context and problem statement

The collection started in Notion and was migrated to Postgres (Supabase)
behind a `COLLECTION_SOURCE=notion|postgres` switch (see
[[0008-per-variant-inventory-fields-and-bearer-rls-fix]]), deliberately kept
as something you could turn on and roll back without a release: the tables
were additive, Notion stayed authoritative until the switch flipped, and
flipping it back was the whole rollback plan.

The migration is done and confirmed working on Supabase. The question is
whether the Notion code path should stay in the tree as a dormant fallback
(the original design's intent) or be deleted now that it has no reason to
run again.

## Considered options

1. **Keep `COLLECTION_SOURCE=notion` as a dormant path.** Local dev only
   needs to stop requiring `NOTION_TOKEN`; the adapter, the connections UI,
   and the switch stay in the tree unused.
2. **Remove the Notion integration entirely.** Delete the adapter, the
   Notion-only API routes, the "From Notion" settings panel, the encryption
   layer that existed only to store a Notion token, and the one-time import
   script; make Postgres the only store.

## Decision

We will remove the Notion integration entirely (option 2).

Chosen because the rollback plan it was built for has no reason to be
exercised anymore, and a switch nothing ever flips again is exactly the kind
of backwards-compatibility shim this project avoids once nothing exercises
it. Keeping it would mean carrying dead code, a dead settings panel, and a
dead encryption-at-rest system for a return path that will not be taken.

## Consequences

- Good, because `lib/storage/collection.ts` is now one unconditional path
  instead of a branch, and `lib/core/env.ts` checks fewer variables more
  honestly — `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are
  now correctly `required` instead of "optional until migrated".
- Good, because `SECRETS_KEY` and `lib/storage/secrets.ts` — which existed
  for exactly one purpose, encrypting a stored Notion token — are gone
  rather than left as an unused encryption system nobody is testing.
- Bad, because `scripts/import-notion.mjs` is gone, so there is no
  documented path back to Notion if Supabase ever needs to be abandoned;
  the only rollback now is a database restore.
- Bad, because `scripts/snapshot-collection-value.mjs` had a real,
  non-cosmetic dependency on Notion (`created_time` as the acquisition
  date) and had to be rewritten against `acquired_at` in Postgres rather
  than simply deleted with the rest.
- Neutral, because a new migration
  (`supabase/migrations/20260815120000_drop_notion_connections.sql`) drops
  `public.connections`, which only ever held encrypted Notion tokens — but
  it has not been applied to the live database yet. Applying a `drop table`
  against production is a deliberate follow-up action, not something to run
  unattended.
- Neutral, because the sibling `bartdunweg.com` portfolio repo has its own
  separate `lib/notion.ts` (with the same `TRADING_DATABASE` id) for its
  own `/about` page. That repo is untouched by this change; it was never
  part of Card Orb's Notion adapter and has no dependency on anything
  removed here.

## Confirmation

`npm run check` (typecheck, tests, lint) is green with the integration
removed. `docs/decisions/0008-per-variant-inventory-fields-and-bearer-rls-fix.md`
already establishes that Postgres carries `acquired_at`, which is what makes
the snapshot script's rewrite possible without losing acquisition history.
Applying `supabase/migrations/20260815120000_drop_notion_connections.sql` to
production, when it happens, is the remaining step that closes this out.

## Related

- Supersedes: none — this is a follow-on to the migration decided in
  [[0008-per-variant-inventory-fields-and-bearer-rls-fix]], not a reversal
  of it.
- Code: `lib/storage/collection.ts`, `lib/core/env.ts`,
  `scripts/snapshot-collection-value.mjs`,
  `supabase/migrations/20260815120000_drop_notion_connections.sql`
