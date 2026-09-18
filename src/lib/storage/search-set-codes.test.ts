import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A set's printed code in the search box (migration 20260918130000), run in an in-process
 * Postgres against a small shelf that holds the clashes the live copy has: "mew" is 151's code
 * and a Pokémon, "pal" is Paldea Evolved's and the start of Palkia, "ex" is Expedition's and the
 * suffix of every Charizard ex, and "brs" is carried by a set and its Trainer Gallery.
 *
 * The ranking lives in SQL, so it is tested where it runs: a restatement of the SQL in TypeScript
 * would pass while the function did something else.
 */
const MIGRATIONS = [
  "20260918090000_search_from_the_copy.sql",
  "20260918110000_short_search_words_unfolded.sql",
  "20260918130000_search_by_set_code.sql",
].map((file) => readFileSync(join(__dirname, "../../../supabase/migrations", file), "utf8"));

let db: PGlite;

const SETS: [id: string, name: string, code: string | null, date: string][] = [
  ["sv01", "Scarlet & Violet", "SVI", "2023/03/31"],
  ["sv02", "Paldea Evolved", "PAL", "2023/06/09"],
  ["sv03.5", "151", "MEW", "2023/09/22"],
  ["sv04", "Paradox Rift", "PAR", "2023/11/03"],
  ["ecard1", "Expedition Base Set", "EX", "2002/09/15"],
  ["swsh9", "Brilliant Stars", "BRS", "2022/02/25"],
  ["swsh9tg", "Brilliant Stars Trainer Gallery", "BRS", "2022/02/25"],
  ["base1", "Base Set", "BS", "1999/01/09"],
  ["xyp", "XY Black Star Promos", null, "2013/10/12"],
  ["dp1", "Diamond & Pearl", "DP", "2007/05/23"],
  ["dpp", "DP Black Star Promos", null, "2007/05/01"],
];

const CARDS: [id: string, setId: string, number: string, name: string][] = [
  ["sv01-001", "sv01", "001", "Pineco"],
  ["sv01-002", "sv01", "002", "Forretress ex"],
  ["sv02-123", "sv02", "123", "Garganacl"],
  ["sv02-188", "sv02", "188", "Pal Pad"],
  ["sv02-010", "sv02", "010", "Charmander"],
  ["sv04-123", "sv04", "123", "Palkia"],
  ["sv03.5-006", "sv03.5", "006", "Charizard ex"],
  ["sv03.5-151", "sv03.5", "151", "Mew ex"],
  ["sv03.5-150", "sv03.5", "150", "Mewtwo"],
  ["sv03.5-001", "sv03.5", "001", "Bulbasaur"],
  ["sv04-054", "sv04", "054", "Charizard ex"],
  ["sv04-199", "sv04", "199", "Mew ex"],
  ["ecard1-039", "ecard1", "039", "Charizard"],
  ["ecard1-100", "ecard1", "100", "Pikachu"],
  ["swsh9-018", "swsh9", "018", "Charizard V"],
  ["swsh9tg-TG03", "swsh9tg", "TG03", "Charizard"],
  ["base1-4", "base1", "4", "Charizard"],
  ["base1-58", "base1", "58", "Pikachu"],
  ["xyp-XY124", "xyp", "XY124", "Pikachu"],
  ["sv04-091", "sv04", "091", "Absol"],
  ["dp1-103", "dp1", "103", "Turtwig"],
  ["dpp-DP16", "dpp", "DP16", "Pikachu"],
];

beforeAll(async () => {
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create schema if not exists extensions;
    create extension if not exists pg_trgm schema extensions;
    create table public.catalogue_sets (
      language text, id text, name text, abbreviation text, release_date text
    );
    create table public.catalogue_cards (
      language text, id text, set_id text, local_id text, name text, set_name text,
      series text, release_date text, rarity text, types text[], image text, category text,
      trainer_type text, full_art boolean default false, local_name text, search text,
      number_order text
    );
    create role service_role;
  `);
  for (const [id, name, code, date] of SETS)
    await db.query("insert into public.catalogue_sets values ('en', $1, $2, $3, $4)", [
      id,
      name,
      code,
      date,
    ]);
  for (const [id, setId, number, name] of CARDS) {
    const [, setName, , date] = SETS.find(([s]) => s === setId)!;
    await db.query(
      `insert into public.catalogue_cards (language, id, set_id, local_id, name, set_name, release_date, search, number_order)
       values ('en', $1, $2, $3, $4, $5, $6, lower($4 || ' ' || $3 || ' ' || $5), lpad($3, 9, '0'))`,
      [id, setId, number, name, setName, date],
    );
  }
  // The Japanese shelf: no abbreviation, and a two-character id the id rule leaves alone.
  await db.exec(`
    insert into public.catalogue_sets values ('ja', 'S8', 'Fusion Arts', null, '2021/09/24');
    insert into public.catalogue_cards (language, id, set_id, local_id, name, set_name, release_date, search, number_order)
    values
      ('ja', 'S8-001', 'S8', '001', 'Pikachu', 'Fusion Arts', '2021/09/24', 'pikachu 001 fusion arts', '000000001'),
      ('ja', 'S8-002', 'S8', '002', 'Eevee', 'Fusion Arts', '2021/09/24', 'eevee 002 fusion arts', '000000002');
  `);
  for (const sql of MIGRATIONS) await db.exec(sql);
});

afterAll(async () => {
  await db?.close();
});

/** What the palette gets for these words: the ids in order, and the count. */
async function search(...words: string[]) {
  return searchIn("en", ...words);
}

async function searchIn(language: string, ...words: string[]) {
  const { rows } = await db.query<{ id: string; total_count: number }>(
    "select id, total_count from public.search_catalogue_cards($1, $2, null, null, null, null, false, 50, 0)",
    [language, words],
  );
  return { ids: rows.map((r) => r.id), total: Number(rows[0]?.total_count ?? 0) };
}

describe("a set's printed code beside other words", () => {
  it("narrows to that set: pal 123 is Paldea Evolved's 123, not Palkia 123", async () => {
    expect((await search("pal", "123")).ids).toEqual(["sv02-123"]);
  });

  it("narrows to that set: svi 001 is Scarlet & Violet's Pineco", async () => {
    expect((await search("svi", "001")).ids).toEqual(["sv01-001"]);
  });

  it("narrows to that set where the code is a Pokémon: mew charizard is 151's Charizard", async () => {
    expect((await search("mew", "charizard")).ids).toEqual(["sv03.5-006"]);
  });

  it("reads the word as the name where a card's name holds it whole: charizard ex", async () => {
    const { ids } = await search("charizard", "ex");
    // Every Charizard ex, not Expedition's Charizard alone.
    expect(ids.slice(0, 2).sort()).toEqual(["sv03.5-006", "sv04-054"]);
  });

  it("reads mew ex and pal pad as the names they are", async () => {
    expect((await search("mew", "ex")).ids.sort()).toEqual(["sv03.5-151", "sv04-199"]);
    expect((await search("pal", "pad")).ids).toEqual(["sv02-188"]);
  });

  it("reads the word as text where its set holds no card the other words find", async () => {
    // Diamond & Pearl (DP) has no Pikachu; the DP16 promo, found by its number, stays the answer.
    expect((await search("dp", "pikachu")).ids).toEqual(["dpp-DP16"]);
    expect((await search("dp", "turtwig")).ids).toEqual(["dp1-103"]);
  });

  it("answers both sets that share a code", async () => {
    expect((await search("brs", "charizard")).ids.sort()).toEqual(["swsh9-018", "swsh9tg-TG03"]);
  });

  it("takes the code in any case the caller sends it folded", async () => {
    expect((await search("bs", "charizard")).ids).toEqual(["base1-4"]);
  });
});

describe("a set's printed code on its own", () => {
  it("is that set's cards where no name holds the code", async () => {
    const { ids, total } = await search("svi");
    expect(ids.sort()).toEqual(["sv01-001", "sv01-002"]);
    expect(total).toBe(2);
  });

  it("puts the set before a name that only holds the code inside a word: bs is Base Set, then Absol", async () => {
    const { ids } = await search("bs");
    expect(ids.slice(0, 2).sort()).toEqual(["base1-4", "base1-58"]);
    expect(ids[2]).toBe("sv04-091");
  });

  it("is both sets' cards for a shared code", async () => {
    expect((await search("brs")).ids.sort()).toEqual(["swsh9-018", "swsh9tg-TG03"]);
  });

  it("keeps every name match first where the code clashes, and the set's cards follow", async () => {
    const { ids } = await search("mew");
    // Mew ex twice and Mewtwo: the names, as before.
    expect(ids.slice(0, 3).sort()).toEqual(["sv03.5-150", "sv03.5-151", "sv04-199"]);
    // Then the rest of 151, newest first within the band.
    expect(ids.slice(3).sort()).toEqual(["sv03.5-001", "sv03.5-006"]);
  });

  it("keeps Palkia and Pal Pad above Paldea Evolved's other cards for pal", async () => {
    const { ids } = await search("pal");
    expect(ids.slice(0, 2).sort()).toEqual(["sv02-188", "sv04-123"]);
    expect(ids.slice(2).sort()).toEqual(["sv02-010", "sv02-123"]);
  });
});

describe("a Japanese set's code", () => {
  it("is its id, two characters included", async () => {
    expect((await searchIn("ja", "s8")).ids).toEqual(["S8-001", "S8-002"]);
    expect((await searchIn("ja", "s8", "pikachu")).ids).toEqual(["S8-001"]);
  });

  it("names nothing on the English shelf", async () => {
    expect((await search("s8")).ids).toEqual([]);
  });
});

describe("a search without a code", () => {
  it("is unchanged: charizard is every Charizard, the name first", async () => {
    const { ids } = await search("charizard");
    expect(ids).toHaveLength(6);
    expect(ids.every((id) => CARDS.find(([c]) => c === id)![3].startsWith("Charizard"))).toBe(true);
  });

  it("still reads a set id as the set", async () => {
    expect((await search("sv03.5", "charizard")).ids).toEqual(["sv03.5-006"]);
  });
});
