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
 * 20260915161500), and asked as each role. The service role is made as Supabase makes it, with
 * BYPASSRLS and its grant on the table, because the function runs as its caller (security invoker).
 * What it cannot prove is how long the function takes on the live table, which only the live table
 * can say.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260923120000_market_mover_candidates.sql"),
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
  alter table public.card_price_months enable row level security;
  grant select on public.card_price_months to authenticated, service_role;
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

/** The day the API passes: the latest price day, which in these rows is 2026-09-03. */
const LATEST = "2026-09-03";

const candidates = async (until = LATEST, days = 7, limit = 200) => {
  await db.exec("reset role");
  await db.exec("set role service_role");
  const { rows } = await db.query<Row>(
    "select tcg_id, printing, was_cents, now_cents, first_day::text, last_day::text, until_day::text from public.market_mover_candidates($1, $2, $3)",
    [until, days, limit],
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
    expect((await candidates(LATEST, 7, 1)).map((r) => r.tcg_id)).toEqual(["faller"]);
  });

  /* Told the day rather than finding it: counting down from the 31st cost a pass over the month
     for every day after the last one written. */
  it("ends the window on the day it is given", async () => {
    // The week to 31 August is flat for every card: the moves are all in September.
    expect(await candidates("2026-08-31")).toEqual([]);
    expect((await candidates("2026-09-02")).map((r) => r.until_day)).toContain("2026-09-02");
  });

  it("holds the number of days to between one and thirty-one", async () => {
    // Zero is read as one day: 2 to 3 September, where only the Charizard moved.
    expect((await candidates(LATEST, 0)).map((r) => r.tcg_id)).toEqual(["charizard"]);
    // A thousand is read as thirty-one: back to 3 August, where `earlier` jumped.
    const month = await candidates(LATEST, 1000);
    expect(month[0]).toMatchObject({ tcg_id: "earlier", first_day: "2026-08-03" });
  });

  it("holds the day to one no later than tomorrow, and a day before any reading to 2000-01-01", async () => {
    await db.exec("reset role");
    const { rows } = await db.query<{ today: string; tomorrow: string; first: string }>(
      "select current_date::text as today, (current_date + 1)::text as tomorrow, date_trunc('month', current_date)::date::text as first",
    );
    const { today, tomorrow, first } = rows[0]!;
    const day = Number(today.slice(8, 10));
    // A card read yesterday and today; on the 1st, yesterday is the month before's last day.
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000);
    const before = `${yesterday.toISOString().slice(0, 8)}01`;
    const rowsOf =
      day > 1
        ? [month("clock", "holofoil", first, { [day - 1]: 1000, [day]: 2000 })]
        : [
            month("clock", "holofoil", first, { 1: 2000 }),
            month("clock", "holofoil", before, { [yesterday.getUTCDate()]: 1000 }),
          ];
    await db.exec(`insert into public.card_price_months (language, tcg_id, printing, month, cents)
      values ${rowsOf.join(", ")}`);
    const far = await candidates("2999-01-01");
    expect(far.find((r) => r.tcg_id === "clock")).toMatchObject({ until_day: tomorrow });
    // Before any reading: read as 2000-01-01, where nothing is, rather than as an error.
    expect(await candidates("1990-01-01")).toEqual([]);
  });

  /* The only caller is the service role, which passes RLS by and keeps its grant on the table, so
     running as the definer bought nothing and would turn a stray grant to anon into a road past RLS. */
  it("runs as its caller, not as its owner", async () => {
    await db.exec("reset role");
    const { rows } = await db.query<{ prosecdef: boolean }>(
      "select prosecdef from pg_proc where proname = 'market_mover_candidates'",
    );
    expect(rows).toEqual([{ prosecdef: false }]);
  });

  it("is refused to anon and to a signed-in caller: the service role reads it inside the API", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec("reset role");
      await db.exec(`set role ${role}`);
      await expect(
        db.query("select * from public.market_mover_candidates('2026-09-03', 7, 200)"),
      ).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role");
  });
});
