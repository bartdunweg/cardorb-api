import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROMO_PREFIXES, compareCardNumbers } from "@/lib/core/util";

/**
 * The catalogue's copy is ordered in Postgres (card_number_sort_key, a stored column) and the
 * collection in TypeScript (compareCardNumbers). One rule in two languages drifts unless
 * something runs both, so this runs the migration in an in-process Postgres and asks it to sort
 * the same list.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260912191742_catalogue_number_order.sql"),
  "utf8",
);

/** Real numbers from the catalogue: promos with and without their letters, galleries, suffixes. */
const NUMBERS = [
  "1",
  "2",
  "10",
  "20",
  "100",
  "013",
  "043",
  "43",
  "088",
  "67",
  "67A",
  "67a",
  "68",
  "150",
  "150A",
  "XY1",
  "XY2",
  "XY10",
  "XY67a",
  "XY122",
  "XY123",
  "xy124",
  "SWSH050",
  "SVP001",
  "SVP013",
  "SM01",
  "BW99",
  "DP10",
  "HGSS01",
  "TG01",
  "TG02",
  "TG10",
  "TG30",
  "GG01",
  "GG70",
  "RC5",
  "RC10",
  "RC32",
  "SV1",
  "SV49",
  "SV94",
  "SH3",
  "H32",
  "A",
  "ONE",
  "?",
  "SV-P",
  "",
  " ",
];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Only the function: the table and its index are Supabase's to hold.
  const fn = /create or replace function[\s\S]*?\$\$;/i.exec(MIGRATION)?.[0];
  if (!fn) throw new Error("The migration no longer defines card_number_sort_key.");
  await db.exec(fn);
});

afterAll(async () => {
  await db?.close();
});

describe("card_number_sort_key", () => {
  it("sorts the catalogue's numbers the way compareCardNumbers does", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select n from unnest($1::text[]) as n
       order by public.card_number_sort_key(n) collate "C"`,
      [[...NUMBERS].reverse()],
    );
    expect(rows.map((r) => r.n)).toEqual([...NUMBERS].sort(compareCardNumbers));
  }, 30_000);

  it("puts a promo among bare numbers and a gallery after the main run", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select n from unnest($1::text[]) as n
       order by public.card_number_sort_key(n) collate "C"`,
      [["TG01", "XY10", "100", "XY2", "20"]],
    );
    expect(rows.map((r) => r.n)).toEqual(["XY2", "XY10", "20", "100", "TG01"]);
  }, 30_000);

  it("strips the same promo prefixes as util.ts", () => {
    const lists = [...MIGRATION.matchAll(/\^\(([A-Z|]+)\)/g)].map((m) => m[1]);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toBe(PROMO_PREFIXES.join("|"));
  });
});
