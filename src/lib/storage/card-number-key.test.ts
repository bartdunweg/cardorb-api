import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROMO_PREFIXES, canonNumber } from "@/lib/core/card-number.mjs";

/**
 * A number is folded in TypeScript for the collection, the copy sheet and the import
 * (canonNumber) and in Postgres for fold_card (card_number_key). One rule in two languages drifts
 * unless something runs both, so this runs the migration in an in-process Postgres, over the same
 * numbers, and folds two real rows through fold_card.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260915220000_fold_card_reads_numbers_folded.sql"),
  "utf8",
);

/** Numbers as the copy and the collection spell them: padded, bare, promos, galleries, suffixes. */
const NUMBERS = [
  "1",
  "01",
  "001",
  "0",
  "00",
  "10",
  "100",
  "074",
  " 088 ",
  "67a",
  "67A",
  "060a",
  "SWSH020",
  "swsh20",
  "020",
  "SVP085",
  "XY67a",
  "TG01",
  "tg1",
  "GG05",
  "SV049",
  "H01",
  "H1",
  "BW004",
  "48/108",
  "A",
  "ONE",
  "?",
  "!",
  "SV-P",
  "",
];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Only what fold_card reads and writes: the table itself is Supabase's to hold.
  await db.exec(`
    create table public.cards (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      name text not null,
      number text not null,
      set_name text not null,
      tcg_id text,
      owned boolean not null default true,
      language text,
      finish text,
      foil_pattern text,
      edition text,
      condition text,
      grade text,
      collection_id uuid,
      is_favorite boolean not null default false,
      quantity integer not null default 1,
      notes text,
      purchase_price numeric,
      purchase_date date,
      acquired_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.exec(MIGRATION);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe("card_number_key", () => {
  it("folds every number the way canonNumber does", async () => {
    const { rows } = await db.query<{ n: string; key: string }>(
      "select n, public.card_number_key(n) as key from unnest($1::text[]) with ordinality as u(n, i) order by i",
      [NUMBERS],
    );
    expect(rows.map((r) => r.key)).toEqual(NUMBERS.map(canonNumber));
  }, 30_000);

  it("strips the same promo prefixes as card-number.mjs", () => {
    const lists = [...MIGRATION.matchAll(/\^\(([A-Z|]+)\)/g)].map((m) => m[1]);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toBe(PROMO_PREFIXES.join("|"));
  });
});

describe("fold_card", () => {
  const ME = "00000000-0000-0000-0000-000000000001";

  it("folds a row spelt 1 into its twin spelt 001, and leaves a gallery's TG01 alone", async () => {
    const add = async (number: string, tcgId: string) =>
      (
        await db.query<{ id: string }>(
          `insert into public.cards (user_id, name, number, set_name, tcg_id, finish)
           values ($1, 'Grookey', $2, 'Sword & Shield', $3, 'normal')
           returning id`,
          [ME, number, tcgId],
        )
      ).rows[0]!.id;
    const padded = await add("001", "swsh1-1");
    await add("1", "swsh1-1");
    await add("TG01", "swsh1-TG01");

    const { rows } = await db.query<{ number: string; quantity: number }>(
      "select number, quantity from public.fold_card($1, $2)",
      [padded, ME],
    );
    expect(rows).toEqual([{ number: "001", quantity: 2 }]);
    const left = await db.query<{ number: string }>(
      "select number from public.cards where user_id = $1 order by number",
      [ME],
    );
    expect(left.rows.map((r) => r.number)).toEqual(["001", "TG01"]);
  }, 30_000);
});
