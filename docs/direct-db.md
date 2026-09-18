# The direct database connection

Every read of Postgres went through PostgREST and Supabase's gateway. For the one-row reads that
stand in front of a request that trip is the whole cost: `store cardsVersion` is 0.05 to 0.18 ms
in Postgres and a median of 40 ms (p90 150 ms) from the API on Vercel (api#559). With
`DATABASE_POOLER_URL` set, two reads skip the gateway and ask Supavisor, Supabase's connection
pooler, in transaction mode (`src/lib/storage/direct.ts`):

| Read | Who calls it | Why it is safe without RLS |
|---|---|---|
| `profiles.cards_version` by id | every collection read (`cachedRows`) | the id is the viewer `authorise()` verified, or a public owner read through the service role today; both clients could already read that row. The anonymous fallback stays on the gateway |
| the latest `usd_eur_rates` row | the dollar rate, on a Data Cache miss (hourly) | the rate belongs to nobody; the service role reads it today |

Unset, `pg` is never loaded and every read is what it was. Set, a direct read that fails is
asked of the gateway and the connection is left alone for a minute (`[direct] ... failed` in the
log).

## Who it connects as

`cardorb_direct` (migration `20260918150000_direct_read_role.sql`), never `postgres`. It may read
`profiles(id, cards_version)` and `usd_eur_rates(day, rate)`: no card, price paid, note, username
or email, and no write. R-SEC-002 is the rule: every query on this connection is parameterised and
names the person by the id the caller verified, and anything that relies on RLS to keep one
person from another stays on PostgREST. Reading more is a migration granting the column, beside
the query.

The pooler's certificate chains to Supabase Root 2021 CA, which no public trust store holds; the
connection verifies against the copy in `src/lib/storage/direct-root-ca.ts` and never switches
verification off.

## Turning it on (the owner's steps)

The migration lands with the merge and makes the role without a password, so nothing can log in
as it yet.

1. **The pooler string.** Supabase dashboard, project Card Orb (`fprjroupecdhosfdrqhv`), the
   **Connect** button at the top, **Connection string** tab, **Transaction pooler**. Copy the
   string as shown (`postgresql://postgres.fprjroupecdhosfdrqhv:[YOUR-PASSWORD]@aws-…-eu-west-1.pooler.supabase.com:6543/postgres`).
   The placeholder stays: only the host, port and project ref are used.
2. **A password for the role, and the URL.** In a checkout of `cardorb-api` on `main`:

   ```sh
   node scripts/direct-db-credentials.mjs '<the string from step 1>'
   ```

   It prints an `alter role cardorb_direct with password 'SCRAM-SHA-256$…'` line (a verifier, not
   the password) and a `vercel env add` line.
3. **The role.** Paste the `alter role` line into the dashboard's **SQL Editor** and run it.
4. **Vercel.** Run the printed line from the same checkout. It is:

   ```sh
   vercel env add DATABASE_POOLER_URL production --sensitive --project cardorb-api < <file> && rm -r <dir>
   ```

   Production only: previews keep the gateway, so a preview proves the variable-unset path.
5. **Redeploy**, because a variable reaches only deployments made after it:

   ```sh
   vercel redeploy https://api.cardorb.com --target production
   ```

   or, in the Vercel dashboard, project `cardorb-api`, **Deployments**, the latest production
   one, **Redeploy**.

To rotate, run steps 2 to 5 again (`vercel env rm DATABASE_POOLER_URL production` first). To turn
it off, remove the variable and redeploy.

## Measuring it

Compare the same lines before and after, user requests only:

```sh
vercel logs --project cardorb-api --environment production --since 1h --expand --query "store cardsVersion"
vercel logs --project cardorb-api --environment production --since 1h --expand --query "pg cardsVersion"
vercel logs --project cardorb-api --environment production --since 1h --expand --query "[direct]"
```

- Before (api#559, 2026-09-18): `[timing] store cardsVersion` p50 40 ms, p90 150 ms.
- After, expected: a `[timing] pg cardsVersion` line beside every `store cardsVersion` (the direct
  path answered), and `store cardsVersion` at a few milliseconds on a warm instance: Vercel dub1
  to Supavisor to Postgres, all in Dublin, with no gateway. The first read on a fresh instance
  pays the connection and its TLS handshake, tens of milliseconds, once.
- No `[direct]` lines. One means a read failed and went to the gateway for a minute; the message
  says why (a wrong password reads `password authentication failed`).
- Use the "quiet" filter from api#559 (no collection build or rows read on the instance within two
  seconds), since a build's blocked event loop is counted by every timer beside it.

This cannot be measured before the variable exists: nothing here has the pooler password, and a
local run crosses the Mac's own 12 to 20 ms to Amsterdam and back, which is not the path Vercel
takes.
