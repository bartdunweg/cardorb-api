/**
 * A direct Postgres connection for the hot single-row reads, beside PostgREST rather than instead.
 *
 * Why: `store cardsVersion` is one row Postgres answers in 0.05 to 0.18 ms (pg_stat_statements),
 * and the API waited a median of 40 ms and a p90 of 150 ms for it in production (api#559), in
 * front of every collection read. The whole of that is the trip through Supabase's gateway; Vercel
 * dub1 and Supabase eu-west-1 are both Dublin. This connection goes to Supavisor, Supabase's
 * connection pooler, in transaction mode, and skips the gateway.
 *
 * Off unless `DATABASE_POOLER_URL` is set. Unset, nothing here is imported past this file, `pg` is
 * never loaded, and every read goes through PostgREST exactly as before. Set, a read that fails
 * here is asked of PostgREST instead and the connection is left alone for a minute, so a wrong
 * string or a pooler outage costs one slow request a minute and never an answer.
 *
 * Security (R-SEC-002): this connection has no JWT, so RLS cannot see who is asking. It connects as
 * `cardorb_direct` (migration 20260918150000), which may read `profiles(id, cards_version)` and
 * `usd_eur_rates(day, rate)` and nothing else; every query below is parameterised and names the
 * person it reads by the id the caller already verified. A query that would rely on RLS to keep
 * one person from another's rows does not belong here.
 *
 * The pool, for Vercel Fluid Compute: one per instance, made on the first read and reused by every
 * request after it; three connections at most (a read holds one for about a millisecond, and
 * Supavisor, not this, is the pool that matters); an idle connection closed after five seconds
 * and attachDatabasePool() keeping the instance alive until it is, so no socket is frozen open
 * across a suspension. Transaction mode hands each transaction a different server connection, so
 * nothing here names a prepared statement: node-postgres only prepares a named one (`name:`), and
 * an unnamed statement lives for its own query.
 *
 * `pg` rather than `postgres` (porsager): attachDatabasePool() recognises a `pg` Pool and throws
 * "Unsupported database pool type" for the other. Both load in under 10 ms (pg 9 ms, postgres
 * 6 ms, measured on Node 24), and only when the variable is set.
 */

import type { Pool, PoolConfig } from "pg";
import { SUPABASE_ROOT_2021_CA } from "./direct-root-ca";
import { timed } from "../core/timing";

const VARIABLE = "DATABASE_POOLER_URL";

/** Whether this deployment has a direct connection at all. */
export function directConfigured(): boolean {
  return Boolean(process.env[VARIABLE]?.trim());
}

/**
 * The pool's settings for a connection string. Parsed here rather than handed to pg as
 * `connectionString`, because pg lets the string's own `sslmode` replace the `ssl` below, and
 * `sslmode=require` would ask Node's public trust store, which does not hold Supabase's root.
 * Exported for the test; the string itself is never logged.
 */
export function poolConfig(url: string): PoolConfig {
  const u = new URL(url);
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error(`${VARIABLE} is not a postgres:// URL`);
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6543,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || "postgres",
    // Verified against Supabase's own root, host name included; never rejectUnauthorized: false.
    ssl: { ca: SUPABASE_ROOT_2021_CA.trim(), rejectUnauthorized: true, servername: u.hostname },
    max: 3,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
    // Supavisor may move; a connection older than this is replaced rather than trusted.
    maxLifetimeSeconds: 300,
    allowExitOnIdle: true,
  };
}

let pool: Promise<Pool> | null = null;

async function thePool(): Promise<Pool> {
  pool ??= (async () => {
    const [{ Pool }, { attachDatabasePool }] = await Promise.all([
      import("pg"),
      import("@vercel/functions/db-connections"),
    ]);
    const made = new Pool(poolConfig(process.env[VARIABLE]!.trim()));
    // An idle connection that dies emits here; unheard, it would take the process down.
    made.on("error", (err) => console.error("[direct] idle connection lost:", err.message));
    attachDatabasePool(made);
    return made;
  })().catch((err) => {
    pool = null;
    throw err;
  });
  return pool;
}

/** Until when the connection is left alone after a failure (epoch ms). */
let restingUntil = 0;
const REST_MS = 60_000;

/**
 * One parameterised read, or undefined where there is no direct connection or it failed: the
 * caller then asks PostgREST, as it did before this file existed. `text` is a constant from
 * below with `$1`-style placeholders; values only ever travel in `values`.
 */
async function read<T>(label: string, text: string, values: unknown[]): Promise<T[] | undefined> {
  if (!directConfigured() || Date.now() < restingUntil) return undefined;
  try {
    const p = await thePool();
    const result = await timed(`pg ${label}`, () => p.query({ text, values }));
    return result.rows as T[];
  } catch (err) {
    restingUntil = Date.now() + REST_MS;
    console.error(
      `[direct] ${label} failed, asking the gateway for the next minute:`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

/** The queries this connection may run, and the only ones (R-SEC-002). */
export const DIRECT_SQL = {
  cardsVersion: "select cards_version from public.profiles where id = $1",
  latestUsdEurRate:
    "select day::text as day, rate::text as rate from public.usd_eur_rates order by day desc limit 1",
} as const;

/**
 * The person's cards version, as postgres.cardsVersion() answers it: the number, null where there
 * is no such profile, and undefined where this connection could not say (ask the gateway).
 */
export async function directCardsVersion(userId: string): Promise<number | null | undefined> {
  const rows = await read<{ cards_version: string | number }>(
    "cardsVersion",
    DIRECT_SQL.cardsVersion,
    [userId],
  );
  if (rows === undefined) return undefined;
  if (rows.length === 0) return null;
  // bigint arrives as a string from pg; PostgREST sent a JSON number.
  const version = Number(rows[0]!.cards_version);
  return Number.isSafeInteger(version) ? version : null;
}

/**
 * The latest stored dollar rate, as postgres.readLatestUsdEurRate() answers it, or undefined
 * where this connection could not say.
 */
export async function directLatestUsdEurRate(): Promise<
  { day: string; rate: number } | null | undefined
> {
  const rows = await read<{ day: string; rate: string }>(
    "usdEurRate",
    DIRECT_SQL.latestUsdEurRate,
    [],
  );
  if (rows === undefined) return undefined;
  if (rows.length === 0) return null;
  const rate = Number(rows[0]!.rate);
  return rate > 0 ? { day: rows[0]!.day, rate } : null;
}

/** For tests: forget the pool and any rest. */
export function resetDirect(): void {
  pool = null;
  restingUntil = 0;
}
