import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 20260915100000 respells the Galarian Gallery and Trainer Gallery copies' rarities, and
 * before it does, adds the new words to every binder rule and Pokédex setting that kept those
 * copies under the old ones. This runs that part in an in-process Postgres, twice.
 */
const MIGRATION = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260915100000_english_card_facts_round_two.sql"),
  "utf8",
);
const GALLERIES = MIGRATION.slice(MIGRATION.indexOf("create temporary table gallery_words"));
const SETTINGS = GALLERIES.slice(
  GALLERIES.indexOf("update collections"),
  GALLERIES.indexOf("-- 3."),
);

const OWNER = "00000000-0000-0000-0000-000000000001";
const NOBODY = "00000000-0000-0000-0000-000000000002";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table cards (user_id uuid, tcg_id text, language text, rarity text, name text);
    create table collections (id int, user_id uuid, rule jsonb, pokedex jsonb);
    insert into cards values
      ('${OWNER}', 'swsh12pt5gg-GG44', 'en', 'Ultra Rare', 'Mewtwo VSTAR'),
      ('${OWNER}', 'swsh12pt5gg-GG70', 'en', 'Secret Rare', 'Arceus VSTAR'),
      ('${OWNER}', 'swsh12pt5gg-GG10', 'en', 'Rare', 'Mew'),
      ('${OWNER}', 'swsh12tg-TG12', 'en', 'Holo Rare V', 'Kricketune V');
    insert into collections values
      (1, '${OWNER}', null, '{"missing": true, "rarities": ["Ultra Rare / v", "Secret Rare"]}'),
      (2, '${OWNER}', '{"rarities": ["Holo Rare V", "Rare"]}', null),
      (3, '${NOBODY}', '{"rarities": ["Ultra Rare"]}', '{"missing": true, "rarities": ["Secret Rare"]}');
  `);
  await db.exec(GALLERIES);
});

afterAll(async () => {
  await db?.close();
});

const settings = async () =>
  (
    await db.query<{ id: number; rule: unknown; pokedex: unknown }>(
      "select id, rule, pokedex from collections order by id",
    )
  ).rows;

describe("the gallery respelling migration", () => {
  it("adds the new word beside the old, with the split the gallery's cards fall in", async () => {
    const [pokedex, rule, nobody] = await settings();
    expect(pokedex!.pokedex).toEqual({
      missing: true,
      rarities: ["Ultra Rare / v", "Galarian Gallery / v", "Secret Rare"],
    });
    expect(rule!.rule).toEqual({
      rarities: ["Holo Rare V", "Ultra Rare", "Rare", "Galarian Gallery"],
    });
    // An account without a gallery copy is left as it was.
    expect(nobody!.rule).toEqual({ rarities: ["Ultra Rare"] });
    expect(nobody!.pokedex).toEqual({ missing: true, rarities: ["Secret Rare"] });
  });

  it("respells the copies, and a second run of the settings changes nothing", async () => {
    const before = await settings();
    await db.exec(SETTINGS);
    expect(await settings()).toEqual(before);
    const { rows } = await db.query<{ tcg_id: string; rarity: string }>(
      "select tcg_id, rarity from cards order by tcg_id",
    );
    expect(rows).toEqual([
      { tcg_id: "swsh12pt5gg-GG10", rarity: "Galarian Gallery" },
      { tcg_id: "swsh12pt5gg-GG44", rarity: "Galarian Gallery" },
      { tcg_id: "swsh12pt5gg-GG70", rarity: "Galarian Gallery" },
      { tcg_id: "swsh12tg-TG12", rarity: "Ultra Rare" },
    ]);
  });
});
