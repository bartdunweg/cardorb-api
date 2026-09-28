import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthsFromDays } from "../core/price-months.mjs";

/**
 * Migration 20260928120000 keeps the lowest listing beside a market figure the rule does not
 * believe, in `listing_cents`, and merges it the way `cents` is merged.
 *
 * Run against an in-process Postgres holding card_price_months and its merge function as they are,
 * with a row written before the column existed, and the rows sent as writeCardPrices sends them
 * (monthsFromDays).
 */
const MIGRATION = readFileSync(
  join(
    __dirname,
    "../../../supabase/migrations/20260928120000_price_listing_beside_disbelieved_market.sql",
  ),
  "utf8",
);

const SCHEMA = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create table public.card_price_months (
    language text not null, tcg_id text not null, printing text not null,
    month date not null check (extract(day from month) = 1), cents integer[] not null,
    source text not null default 'tcgplayer', updated_at timestamptz not null default now(),
    primary key (language, tcg_id, printing, month)
  );
  create or replace function public.merge_price_days(fresh integer[], kept integer[])
  returns integer[] language sql immutable set search_path = '' as $$
    select case
      when fresh is null then kept
      when kept is null then fresh
      else array(select coalesce(fresh[i], kept[i]) from generate_series(1, 31) as i)
    end
  $$;
`;

let db: PGlite;

const upsert = (days: Parameters<typeof monthsFromDays>[0]) =>
  db.query("select public.upsert_card_price_months($1::jsonb)", [
    JSON.stringify(monthsFromDays(days)),
  ]);

const row = async (tcgId: string) =>
  (
    await db.query<{ cents: (number | null)[]; listing_cents: (number | null)[] | null }>(
      "select cents, listing_cents from public.card_price_months where tcg_id = $1",
      [tcgId],
    )
  ).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  const cents = Array.from({ length: 31 }, (_, i) => (i === 0 ? 23196 : "null")).join(",");
  await db.exec(`insert into public.card_price_months (language, tcg_id, printing, month, cents)
    values ('en', 'rocket-4', '1st-edition-holofoil', '2026-09-01', array[${cents}]::integer[])`);
  // Twice: migrate.yml may meet a database that already has the column.
  await db.exec(MIGRATION);
  await db.exec(MIGRATION);
});

afterAll(async () => {
  await db?.close();
});

describe("the lowest listing beside a market figure not believed", () => {
  it("leaves a row from before the column as it was, with no listing", async () => {
    expect(await row("rocket-4")).toMatchObject({ listing_cents: null });
    expect((await row("rocket-4"))?.cents[0]).toBe(23196);
  });

  it("is stored beside the day's figure, and a day without one keeps its figure alone", async () => {
    // Team Rocket's Dark Charizard, 2026-09-28: a market of $121.94 with the cheapest copy at $980.
    await upsert([
      {
        language: "en",
        tcgId: "rocket-4",
        printing: "1st-edition-holofoil",
        date: "2026-09-28",
        price: 121.94,
        listing: 980,
      },
    ]);
    const r = await row("rocket-4");
    expect(r?.cents[0]).toBe(23196);
    expect(r?.cents[27]).toBe(12194);
    expect(r?.listing_cents?.[27]).toBe(98000);
    expect(r?.listing_cents?.[0]).toBeNull();
  });

  it("is kept when a later night sends that month's other days without one", async () => {
    await upsert([
      {
        language: "en",
        tcgId: "rocket-4",
        printing: "1st-edition-holofoil",
        date: "2026-09-29",
        price: 400,
      },
    ]);
    const r = await row("rocket-4");
    expect(r?.listing_cents?.[27]).toBe(98000);
    expect(r?.cents[28]).toBe(40000);
  });

  it("is written by the service role alone", async () => {
    const { rows } = await db.query<{ anon: boolean; service: boolean }>(
      `select has_function_privilege('anon', 'public.upsert_card_price_months(jsonb)', 'execute') as anon,
              has_function_privilege('service_role', 'public.upsert_card_price_months(jsonb)', 'execute') as service`,
    );
    expect(rows[0]).toEqual({ anon: false, service: true });
  });
});
