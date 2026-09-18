import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIRECT_SQL } from "./direct";

/**
 * Migration 20260918150000 makes `cardorb_direct`, the role the direct connection logs in as
 * (R-SEC-002). Run in an in-process Postgres with the tables' real RLS, then asked as that role:
 * the two queries direct.ts runs answer, a private profile's version included, and everything
 * else a leaked connection string might try is refused.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260918150000_direct_read_role.sql"),
  "utf8",
);

const PRIVATE = "00000000-0000-0000-0000-000000000001";
const PUBLIC = "00000000-0000-0000-0000-000000000002";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.profiles (
      id uuid primary key, username text, is_public boolean not null default false,
      cards_version bigint not null default 0
    );
    alter table public.profiles enable row level security;
    create policy profiles_read on public.profiles for select
      using (is_public or id = (select auth.uid()));
    create table public.cards (id int, user_id uuid, notes text, purchase_price numeric);
    alter table public.cards enable row level security;
    create policy cards_read on public.cards for select
      using (user_id = (select auth.uid()) or exists (
        select 1 from public.profiles p where p.id = cards.user_id and p.is_public));
    create table public.usd_eur_rates (day date primary key, rate numeric not null, fetched_at timestamptz);
    alter table public.usd_eur_rates enable row level security;
    insert into public.profiles values ('${PRIVATE}', 'someone', false, 41), ('${PUBLIC}', 'shown', true, 7);
    insert into public.cards values (1, '${PRIVATE}', 'a note', 12.5), (2, '${PUBLIC}', 'shown note', 3);
    insert into public.usd_eur_rates values ('2026-09-17', 0.8512, now()), ('2026-09-18', 0.8498, now());
  `);
  // Twice: migrate.yml may meet a database that already has the role.
  await db.exec(MIGRATION);
  await db.exec(MIGRATION);
  await db.exec("set role cardorb_direct");
});

afterAll(async () => {
  await db?.close();
});

const refused = async (sql: string) => {
  await expect(db.query(sql)).rejects.toThrow(/permission denied/);
};

describe("the cardorb_direct role", () => {
  it("reads a private profile's cards version by its id", async () => {
    const { rows } = await db.query(DIRECT_SQL.cardsVersion, [PRIVATE]);
    expect(rows).toEqual([{ cards_version: 41 }]);
  });

  it("reads no row for an id that is nobody's", async () => {
    const { rows } = await db.query(DIRECT_SQL.cardsVersion, [
      "00000000-0000-0000-0000-00000000dead",
    ]);
    expect(rows).toEqual([]);
  });

  it("reads the latest dollar rate as text, the shape direct.ts parses", async () => {
    const { rows } = await db.query(DIRECT_SQL.latestUsdEurRate);
    expect(rows).toEqual([{ day: "2026-09-18", rate: "0.8498" }]);
  });

  it("is refused every other column of profiles", async () => {
    await refused("select username from public.profiles");
    await refused("select is_public from public.profiles");
    await refused("select * from public.profiles");
  });

  it("is refused every card, public profile or not", async () => {
    await refused("select * from public.cards");
    await refused(`select notes from public.cards where user_id = '${PUBLIC}'`);
  });

  it("cannot write what it can read", async () => {
    await refused(`update public.profiles set cards_version = 0 where id = '${PRIVATE}'`);
    await refused("insert into public.usd_eur_rates (day, rate) values ('2026-09-19', 1)");
    await refused("delete from public.usd_eur_rates");
  });
});
