# Conventions

The rules with an ID that apply **now**, in this repository, beside the path-scoped principles in
`.claude/rules/`. A rule is rewritten or deleted the moment it stops being true; what it used to
say is in `git log -p CONVENTIONS.md`. A request from the owner outranks any rule here: say which
one it departs from, then do it.

- `Enforcement` is `reviewed`, or `enforced by <what enforces it>`. A rule nothing checks is dropped
  or made checkable.
- `Why` is one sentence. Where the reason is genuinely lost, write `unknown`.
- IDs are stable and never reused. They continue the numbering of `bartdunweg/cardorb-web`'s
  CONVENTIONS.md, so an ID named in a conversation means one rule across both repositories.
- Present tense, imperative, no dates.

| ID | Rule | Enforcement | Why |
|---|---|---|---|
| R-DATA-004 | A data fix is a rule the ingest or the read applies to every card, new and old (`src/lib/core/catalogue/`, `tcgplayer-rules.mjs`, `card-number.mjs`), plus a check in `scripts/data-health.mjs` that compares what is stored with what the rule gives today. A hand list is only for facts no rule can derive, and gets a check that flags a new card of its kind. A migration alone fixes only the past. Changing a rule means the stored data follows by itself (the nightly copy rewrites every set within `SET_STALE_DAYS`; a derived value is read, not stored) or a data-health check goes red. | reviewed; each check it asks for is enforced by `.github/workflows/data-health.yml` | Fixes made by list or by migration left the next set wrong: 30th Classic Collection came with TCGdex's numbers and no rarity where Celebrations' Classic Collection had both put right by hand. |

| R-DATA-005 | Which source a card or set fact comes from is declared in `src/lib/core/consensus.mjs` and nowhere else: per field the sources that vote and their weight, per field and source the biases it is known to have, each with a reason and a date. Resolution is always the same: a majority of the voting sources wins, a source with a matching bias does not vote, a source that copies another counts once, and a tie or a split changes nothing and is reported with what each source said. A new fact is one entry in `FIELDS`, a new bias one entry in `EXCEPTIONS`; neither is a new rule of its own somewhere else. Every declared field names the data-health check that holds the copy to it. | enforced by `scripts/data-health.mjs` ("Every fact the consensus rule decides is held by a check") and `src/lib/core/consensus.test.ts` | Rarity, finishes, names, numbers and dates each picked their source in their own place, so a new field started from nothing and no two of them could be explained the same way. |

**Where a rule and the code disagree**, the rule is dead or the code is wrong. Do not decide that
alone: say so in the pull request, and ask the owner.
| R-SEC-002 | The direct Postgres connection (`src/lib/storage/direct.ts`, `DATABASE_POOLER_URL`) logs in as `cardorb_direct` and runs only the queries in `DIRECT_SQL`: parameterised, and naming a person's row by the id the caller already verified. A read whose safety rests on RLS stays on PostgREST. Reading more is a migration that grants the column to `cardorb_direct`, beside the query that needs it. | enforced by `src/lib/storage/direct-role-migration.test.ts` (the role reads the two queries' columns and is refused every other) and `direct.test.ts` (values travel as parameters) | The connection carries no JWT, so RLS cannot tell one person from another there, and the pooler's default user `postgres` reads every account. |
| R-SEC-003 | `anon` and `authenticated` hold only the grants the API uses through a caller's own client, per table and, on `profiles`, per column; everything else in `public` is the service role's. A new table is granted to neither unless a migration says which verb a client needs and why, and Supabase's default privileges no longer hand one out. RLS is the inner wall, not the only one. | enforced by `src/lib/storage/least-privilege-migration.test.ts` (the migration run against the real tables, then asked as each role) | Every table granted both roles INSERT, UPDATE, DELETE and TRUNCATE, so one policy written a little too wide was the whole database to whoever holds the publishable key. |
| R-SEC-004 | A shared secret carried as a bearer token is compared with `timingSafeEqual` behind a length check, never `===` or `!==`, and an unset secret refuses everything. The cron routes go through `refuseCron()` in `src/lib/api/cron.ts`. | enforced by `src/lib/api/cron.test.ts` | `!==` on a string returns at the first byte that differs, so the time it takes to answer tells a guesser how much of the guess was right. |
