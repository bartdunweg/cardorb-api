import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MARKET_MOVER_FLOOR_CENTS } from "../core/collection/market-movers";

/**
 * Migration 20260923120000 gives the market movers their candidates: the printings whose price
 * moved most, in euros, over the last days any row has, narrowed in Postgres so the route never
 * pulls the catalogue's lines into Node.
 *
 * Run against an in-process Postgres holding card_price_months as it is (the key since
 * 20260915161500), and asked as each role. What it cannot prove is how long the function takes on
 * the live table, which only the live table can say.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260923120000_market_mover_candidates.sql"),
  "utf8",
);

const SCHEMA = `
  create role anon;
  create role authenticated;
  create role service_role;
  create table public.card_price_months (
    language text not null, tcg_id text not null, printing text not null,
    month date not null check (extract(day from month) = 1), cents integer[] not null,
    source text not null default 'tcgplayer', updated_at timestamptz not null default now(),
    primary key (language, tcg_id, printing, month)
  );
  alter table public.card_price_months enable row level security;
  grant select on public.card_price_months to authenticated;
  grant usage on schema public to anon, authenticated, service_role;
`;

/** A month row: `days` maps a day of the month to cents; every other day is null. */
const month = (
  tcgId: string,
  printing: string,
  first: string,
  days: Record<number, number>,
  language = "en",
) => {
  const cents = Array.from({ length: 31 }, (_, i) => days[i + 1] ?? "null").join(",");
  return `('${language}', '${tcgId}', '${printing}', '${first}', array[${cents}]::integer[])`;
};

/** Every day from `from` to `to` of a month at `cents`. */
const flat = (from: number, to: number, cents: number) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, cents]));

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(`insert into public.card_price_months (language, tcg_id, printing, month, cents) values
    -- The latest day any row has is 2026-09-03, so the week runs from 2026-08-27 across the month.
    ${month("charizard", "holofoil", "2026-08-01", flat(1, 31, 40000))},
    ${month("charizard", "holofoil", "2026-09-01", { ...flat(1, 2, 40500), 3: 40800 })},
    -- Doubled, and a smaller event than the Charizard's eight euros.
    ${month("common", "normal", "2026-08-01", flat(1, 31, 200))},
    ${month("common", "normal", "2026-09-01", flat(1, 3, 400))},
    -- Four cents to two euros: under the floor at the start, so never a candidate.
    ${month("penny", "normal", "2026-08-01", flat(1, 31, 4))},
    ${month("penny", "normal", "2026-09-01", flat(1, 3, 200))},
    -- A faller, and one that falls under the floor.
    ${month("faller", "holofoil", "2026-08-01", flat(1, 31, 5000))},
    ${month("faller", "holofoil", "2026-09-01", flat(1, 3, 3000))},
    ${month("sunk", "holofoil", "2026-08-01", flat(1, 31, 5000))},
    ${month("sunk", "holofoil", "2026-09-01", flat(1, 3, MARKET_MOVER_FLOOR_CENTS - 1))},
    -- Flat: moved nothing.
    ${month("still", "holofoil", "2026-08-01", flat(1, 31, 9000))},
    ${month("still", "holofoil", "2026-09-01", flat(1, 3, 9000))},
    -- Moved a lot, but before the window: its week is flat.
    ${month("earlier", "holofoil", "2026-08-01", { ...flat(1, 10, 1000), ...flat(11, 31, 90000) })},
    ${month("earlier", "holofoil", "2026-09-01", flat(1, 3, 90000))},
    -- One reading in the window is no move.
    ${month("once", "holofoil", "2026-09-01", { 3: 70000 })},
    -- A reading from before printings were stored is not a printing.
    ${month("legacy", "market", "2026-08-01", flat(1, 31, 1000))},
    ${month("legacy", "market", "2026-09-01", flat(1, 3, 90000))},
    -- The Japanese catalogue shares ids with the English one and is not this list.
    ${month("charizard", "holofoil", "2026-08-01", flat(1, 31, 100), "ja")},
    ${month("charizard", "holofoil", "2026-09-01", flat(1, 3, 900000), "ja")}
  `);
  // Twice: migrate.yml may meet a database that already has the function.
  await db.exec(MIGRATION);
  await db.exec(MIGRATION);
});

afterAll(async () => {
  await db?.close();
});

type Row = {
  tcg_id: string;
  printing: string;
  was_cents: number;
  now_cents: number;
  first_day: string;
  last_day: string;
  until_day: string;
};

const candidates = async (days = 7, limit = 200) => {
  await db.exec("reset role");
  await db.exec("set role service_role");
  const { rows } = await db.query<Row>(
    "select tcg_id, printing, was_cents, now_cents, first_day::text, last_day::text, until_day::text from public.market_mover_candidates($1, $2)",
    [days, limit],
  );
  return rows;
};

describe("market_mover_candidates", () => {
  it("answers the English printings that moved, biggest euro change first, over the week to the latest day", async () => {
    const rows = await candidates();
    expect(rows.map((r) => [r.tcg_id, r.printing, r.was_cents, r.now_cents])).toEqual([
      ["faller", "holofoil", 5000, 3000],
      ["charizard", "holofoil", 40000, 40800],
      ["common", "normal", 200, 400],
    ]);
  });

  it("says which days it compared and the day the window ends", async () => {
    const [first] = await candidates();
    expect(first).toMatchObject({
      first_day: "2026-08-27",
      last_day: "2026-09-03",
      until_day: "2026-09-03",
    });
  });

  it("stops at the number asked for", async () => {
    expect((await candidates(7, 1)).map((r) => r.tcg_id)).toEqual(["faller"]);
  });

  it("is refused to anon and to a signed-in caller: the service role reads it inside the API", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec("reset role");
      await db.exec(`set role ${role}`);
      await expect(
        db.query("select * from public.market_mover_candidates(7, 200)"),
      ).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role");
  });
});
