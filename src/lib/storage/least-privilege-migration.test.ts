import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 20260920120000 takes back what Supabase grants `anon` and `authenticated` on every
 * table in `public` and hands back only the verbs this API uses through a caller's own client
 * (R-SEC-003).
 *
 * Run here against an in-process Postgres holding the fifteen tables as they are, granted as
 * widely as the live database had them, and then asked as each role in turn. A migration is not
 * a unit, so this is not a unit test: it is the grant surface itself, read back from the same
 * file `supabase db push` applies. What it cannot prove is that the live database started where
 * this starts it, which the pull request's before-and-after SELECTs do.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260920120000_least_privilege_grants.sql"),
  "utf8",
);

/** The fifteen tables, with the columns the grants name. Types are only as exact as that needs. */
const SCHEMA = `
  create role anon;
  create role authenticated;
  create table public.profiles (
    id uuid primary key, username text, display_name text, is_public boolean not null default false,
    created_at timestamptz default now(), updated_at timestamptz default now(), avatar_url text,
    onboarded_at timestamptz, wishlist_public boolean default false,
    favorites_public boolean default false, cards_version bigint not null default 0,
    prices_public boolean default false
  );
  create table public.cards (id int primary key, user_id uuid, notes text, purchase_price numeric);
  create table public.collections (id int primary key, user_id uuid, name text);
  create table public.imports (id int primary key, user_id uuid, status text);
  create table public.collection_value_snapshots (user_id uuid, snapshot_date date, value numeric);
  create table public.card_price_months (tcg_id text, language text, month date);
  create table public.reserved_usernames (name text primary key);
  create table public.card_price_months_thinned (month date);
  create table public.card_print_pictures (tcg_id text, url text);
  create table public.catalogue_cards (id text, name text);
  create table public.catalogue_index (id int, document text);
  create table public.catalogue_sets (id text, name text);
  create table public.catalogue_sync (id text, at timestamptz);
  create table public.tcgplayer_prices (product_id int, market numeric);
  create table public.usd_eur_rates (day date primary key, rate numeric);
`;

/** Where the live database was before the migration: Supabase's default, everything to both. */
const AS_IT_WAS = `grant all on all tables in schema public to anon, authenticated;`;

let db: PGlite;

/** Runs `sql` as `role`, and hands back "ok" or the reason Postgres refused. */
async function asRole(role: string, sql: string): Promise<string> {
  await db.exec("reset role");
  await db.exec(`set role ${role}`);
  try {
    await db.query(sql);
    return "ok";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const allowed = async (role: string, sql: string) => {
  expect([role, sql, await asRole(role, sql)]).toEqual([role, sql, "ok"]);
};

const refused = async (role: string, sql: string) => {
  expect([role, sql, await asRole(role, sql)]).toEqual([
    role,
    sql,
    expect.stringMatching(/permission denied/),
  ]);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(AS_IT_WAS);
  await db.exec(MIGRATION);
});

afterAll(async () => {
  await db?.close();
});

describe("what anon may still do", () => {
  it("reads the columns a public profile page is made of", async () => {
    await allowed(
      "anon",
      "select id, username, display_name, avatar_url, is_public, wishlist_public, favorites_public from public.profiles",
    );
  });

  it("is refused the columns that say when an owner last edited", async () => {
    await refused("anon", "select cards_version from public.profiles");
    await refused("anon", "select created_at from public.profiles");
    await refused("anon", "select updated_at from public.profiles");
    await refused("anon", "select * from public.profiles");
  });

  it("reads the reserved names the signup route checks against", async () => {
    await allowed("anon", "select name from public.reserved_usernames");
  });

  it("cannot write a profile", async () => {
    await refused("anon", "update public.profiles set display_name = 'x'");
    await refused("anon", "insert into public.profiles (id) values (gen_random_uuid())");
    await refused("anon", "delete from public.profiles");
  });

  it("cannot touch a card, a binder or an import at all", async () => {
    for (const table of ["cards", "collections", "imports"]) {
      await refused("anon", `select * from public.${table}`);
      await refused("anon", `insert into public.${table} (id) values (1)`);
      await refused("anon", `update public.${table} set id = 2`);
      await refused("anon", `delete from public.${table}`);
    }
  });
});

describe("what authenticated may still do", () => {
  it("reads and writes cards and binders, which RLS then scopes to the owner", async () => {
    for (const table of ["cards", "collections"]) {
      await allowed("authenticated", `select * from public.${table}`);
      await allowed("authenticated", `insert into public.${table} (id) values (1)`);
      await allowed("authenticated", `update public.${table} set id = 2`);
      await allowed("authenticated", `delete from public.${table}`);
    }
  });

  it("reads, starts and updates an import, but never deletes one", async () => {
    await allowed("authenticated", "select * from public.imports");
    await allowed("authenticated", "insert into public.imports (id) values (1)");
    await allowed("authenticated", "update public.imports set status = 'done'");
    await refused("authenticated", "delete from public.imports");
  });

  it("reads its value history and price lines, and writes neither", async () => {
    await allowed("authenticated", "select * from public.collection_value_snapshots");
    await refused(
      "authenticated",
      "insert into public.collection_value_snapshots (value) values (1)",
    );
    await allowed("authenticated", "select * from public.card_price_months");
    await refused(
      "authenticated",
      "insert into public.card_price_months (month) values ('2026-09-20')",
    );
  });

  it("reads its own profile's settings and the cards version the rows cache keys on", async () => {
    await allowed(
      "authenticated",
      "select id, username, display_name, avatar_url, is_public, wishlist_public, favorites_public, onboarded_at, cards_version from public.profiles",
    );
    await refused("authenticated", "select created_at from public.profiles");
    await refused("authenticated", "select * from public.profiles");
  });

  it("writes the settings patch and nothing else on a profile", async () => {
    await allowed(
      "authenticated",
      "update public.profiles set display_name = 'x', avatar_url = null, is_public = true, wishlist_public = true, favorites_public = true, onboarded_at = now(), updated_at = now()",
    );
    // The name is claimed through claim_username(), which is security definer and does its own update.
    await refused("authenticated", "update public.profiles set username = 'taken'");
    await refused("authenticated", "update public.profiles set cards_version = 0");
    await refused("authenticated", "insert into public.profiles (id) values (gen_random_uuid())");
    await refused("authenticated", "delete from public.profiles");
  });
});

describe("the tables only the service role touches", () => {
  const SERVICE_ONLY = [
    "catalogue_cards",
    "catalogue_sets",
    "catalogue_index",
    "catalogue_sync",
    "card_print_pictures",
    "tcgplayer_prices",
    "usd_eur_rates",
    "card_price_months_thinned",
  ];

  it("are refused to both roles, every verb", async () => {
    for (const table of SERVICE_ONLY) {
      for (const role of ["anon", "authenticated"]) {
        await refused(role, `select * from public.${table}`);
        await refused(role, `delete from public.${table}`);
      }
    }
  });

  it("have row level security forced, so a grant alone would not be enough", async () => {
    await db.exec("reset role");
    const { rows } = await db.query<{ relname: string; relforcerowsecurity: boolean }>(
      `select relname, relforcerowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1)
       order by relname`,
      [SERVICE_ONLY],
    );
    expect(rows).toEqual(
      [...SERVICE_ONLY].sort().map((relname) => ({ relname, relforcerowsecurity: true })),
    );
  });
});

describe("the next table this project creates", () => {
  it("is not granted to anon or authenticated by default", async () => {
    await db.exec("reset role");
    await db.exec("create table public.something_new (id int)");
    await refused("anon", "select * from public.something_new");
    await refused("authenticated", "select * from public.something_new");
  });
});
