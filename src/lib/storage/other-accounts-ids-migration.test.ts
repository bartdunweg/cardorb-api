import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 20260917120000 moves other accounts' rows off pokemontcg.io's and Dex's ids onto the
 * copy's. This runs it in an in-process Postgres, twice, and holds every other column still.
 */
const MIGRATION = readFileSync(
  join(
    __dirname,
    "../../../supabase/migrations/20260917120000_other_accounts_rows_on_tcgdex_ids.sql",
  ),
  "utf8",
);

const SOMEONE = "00000000-0000-0000-0000-000000000002";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema if not exists public;
    create table public.catalogue_cards (language text, id text, local_id text);
    create table public.cards (
      id int, user_id uuid, tcg_id text, language text, number text, name text,
      set_name text, rarity text, finish text, quantity int
    );
    insert into public.catalogue_cards values
      ('en', 'sv03.5-052', '052'),
      ('en', 'sv04-129', '129'),
      ('en', 'swshp-SWSH183', 'SWSH183'),
      ('en', 'sv06.5-023', '023');
    insert into public.cards values
      (1, '${SOMEONE}', 'sv35-52', null, '52', 'Meowth', '151', 'Common', 'normal', 2),
      (2, '${SOMEONE}', 'sv4-129', 'en', '129', 'Durant', 'Paradox Rift', 'Uncommon', 'reverse-holo', 1),
      -- A number that is not the new card's: left alone.
      (3, '${SOMEONE}', 'sv65-23', null, '24', 'Croagunk', 'Shrouded Fable', 'Common', 'normal', 1),
      -- An id the copy has: left alone.
      (4, '${SOMEONE}', 'sv03.5-052', null, '52', 'Meowth', '151', 'Common', 'holo', 1),
      -- A Japanese row: never an English id.
      (5, '${SOMEONE}', 'sv35-52', 'ja', '52', 'Meowth', '151', 'Common', 'normal', 1);
  `);
});

afterAll(async () => {
  await db?.close();
});

const rows = async () =>
  (await db.query<Record<string, unknown>>("select * from public.cards order by id")).rows;

describe("the other accounts' id migration", () => {
  it("changes the id of a row whose old id names its set's card, and nothing else", async () => {
    const before = await rows();
    await db.exec(MIGRATION);
    const after = await rows();
    expect(after.map((r) => r.tcg_id)).toEqual([
      "sv03.5-052",
      "sv04-129",
      "sv65-23",
      "sv03.5-052",
      "sv35-52",
    ]);
    // Every other column as it was.
    expect(after.map(({ tcg_id: _, ...rest }) => rest)).toEqual(
      before.map(({ tcg_id: _, ...rest }) => rest),
    );
  });

  it("changes nothing on a second run", async () => {
    const before = await rows();
    await db.exec(MIGRATION);
    expect(await rows()).toEqual(before);
  });
});
