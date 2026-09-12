/**
 * Which Western languages each old set was printed in, from Bulbapedia.
 *
 *   node scripts/set-languages.mjs            # print what it found, and what it could not read
 *   node scripts/set-languages.mjs --write    # write the map
 *
 * ── Why this exists ──
 *
 * The language a copy may be set to was read off TCGdex: the Western catalogues share the
 * English ids, so "is this card printed in German" was a 200 or a 404 at /v2/de/cards/<id>. That
 * works for the modern sets and is wrong for the old ones, because those catalogues do not have
 * them. Measured 2026-09-12: TCGdex' Spanish and Portuguese catalogues hold a record for Base
 * Set with zero cards in it, and Italian holds nothing for Fossil, Neo Genesis, Ruby & Sapphire
 * or Diamond & Pearl. A Spanish Base Set exists in quantity, in two copyright years; a Dutch one
 * exists and TCGdex keeps no Dutch catalogue at all. So for these sets a 404 is a gap in the
 * catalogue, and reading it as "never printed" took the true answer off the form.
 *
 * Bulbapedia writes it down per set, under "Languages this set is released in", in prose: "The
 * Jungle set is released in English, Dutch, German, French, Italian, Spanish, and Portuguese in
 * both 1st and unlimited edition." That sentence is the source here. Only the sentences that
 * name English are read, because the Western release is the one that always does; the Japanese
 * sentence beside it describes a catalogue of its own, which this app asks about separately.
 *
 * Prose, so this is conservative by design: a set whose sentence cannot be read is left out of
 * the map rather than guessed at, and a set that is not in the map keeps the old behaviour
 * (ask TCGdex per card). What it finds is checked into the repo, because it is a fact about
 * cards printed twenty years ago: it does not change, and a build should not depend on a wiki
 * being up.
 *
 * Pre-BW only. From Black & White on, TCGdex' own catalogues carry the sets in every Western
 * language, and it answers per card, which is better than per set: a modern promo can be printed
 * in fewer languages than its set.
 */

import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../src/lib/core/set-languages.generated.json", import.meta.url);
const HOST = "https://bulbapedia.bulbagarden.net/w/index.php";
const AGENT = "cardorb-api set-languages (https://github.com/bartdunweg/cardorb-api)";

/** The languages this map is about: the ones a Western copy can be. */
const WESTERN = {
  English: "en",
  Dutch: "nl",
  German: "de",
  French: "fr",
  Italian: "it",
  Spanish: "es",
  Portuguese: "pt",
};

/**
 * The sets to ask about: everything before Black & White, by TCGdex id, with the Bulbapedia
 * title that carries the answer.
 *
 * What is deliberately absent is what the wiki does not say. pl4 (Arceus) has no "Languages this
 * set is released in" section at all, and neither has any of the Black Star Promo sets (basep,
 * wp, np, dpp, hgssp) or the odd ones out of the EX era (ex5.5, exu, bog, sp). A promo was handed
 * out per region rather than released as a set, so there may be no per-set answer to find; those
 * keep asking TCGdex per card, which for these years means they read as English alone. Checked
 * 2026-09-12, page by page.
 *
 * Written out rather than derived from the set name, because the two do not agree often enough
 * to guess: TCGdex calls it "Ruby & Sapphire" and Bulbapedia "EX Ruby & Sapphire (TCG)". A set
 * with no title here is a set nothing says anything about, which is the promos and the trainer
 * kits: those keep asking TCGdex per card.
 */
const TITLES = {
  base1: "Base Set (TCG)",
  base2: "Jungle (TCG)",
  base3: "Fossil (TCG)",
  base4: "Base Set 2 (TCG)",
  base5: "Team Rocket (TCG)",
  gym1: "Gym Heroes (TCG)",
  gym2: "Gym Challenge (TCG)",
  neo1: "Neo Genesis (TCG)",
  neo2: "Neo Discovery (TCG)",
  neo3: "Neo Revelation (TCG)",
  neo4: "Neo Destiny (TCG)",
  si1: "Southern Islands (TCG)",
  lc: "Legendary Collection (TCG)",
  ecard1: "Expedition Base Set (TCG)",
  ecard2: "Aquapolis (TCG)",
  ecard3: "Skyridge (TCG)",
  ex1: "EX Ruby & Sapphire (TCG)",
  ex2: "EX Sandstorm (TCG)",
  ex3: "EX Dragon (TCG)",
  ex4: "EX Team Magma vs Team Aqua (TCG)",
  ex5: "EX Hidden Legends (TCG)",
  ex6: "EX FireRed & LeafGreen (TCG)",
  ex7: "EX Team Rocket Returns (TCG)",
  ex8: "EX Deoxys (TCG)",
  ex9: "EX Emerald (TCG)",
  ex10: "EX Unseen Forces (TCG)",
  ex11: "EX Delta Species (TCG)",
  ex12: "EX Legend Maker (TCG)",
  ex13: "EX Holon Phantoms (TCG)",
  ex14: "EX Crystal Guardians (TCG)",
  ex15: "EX Dragon Frontiers (TCG)",
  ex16: "EX Power Keepers (TCG)",
  dp1: "Diamond & Pearl (TCG)",
  dp2: "Mysterious Treasures (TCG)",
  dp3: "Secret Wonders (TCG)",
  dp4: "Great Encounters (TCG)",
  dp5: "Majestic Dawn (TCG)",
  dp6: "Legends Awakened (TCG)",
  dp7: "Stormfront (TCG)",
  pl1: "Platinum (TCG)",
  pl2: "Rising Rivals (TCG)",
  pl3: "Supreme Victors (TCG)",
  hgss1: "HeartGold & SoulSilver (TCG)",
  hgss2: "Unleashed (TCG)",
  hgss3: "Undaunted (TCG)",
  hgss4: "Triumphant (TCG)",
  col1: "Call of Legends (TCG)",
  ru1: "Pokémon Rumble (TCG)",
  pop1: "POP Series 1 (TCG)",
  pop2: "POP Series 2 (TCG)",
  pop3: "POP Series 3 (TCG)",
  pop4: "POP Series 4 (TCG)",
  pop5: "POP Series 5 (TCG)",
  pop6: "POP Series 6 (TCG)",
  pop7: "POP Series 7 (TCG)",
  pop8: "POP Series 8 (TCG)",
  pop9: "POP Series 9 (TCG)",
  /* The kits are documented two at a time, one page for both halves of a kit, which is how they
     were sold: a Latios kit and a Latias kit are one release in one set of languages. */
  "tk-ex-latio": "EX Trainer Kit (TCG)",
  "tk-ex-latia": "EX Trainer Kit (TCG)",
  "tk-ex-p": "EX Trainer Kit 2 (TCG)",
  "tk-ex-m": "EX Trainer Kit 2 (TCG)",
  "tk-dp-m": "Diamond & Pearl Trainer Kit (TCG)",
  "tk-dp-l": "Diamond & Pearl Trainer Kit (TCG)",
  "tk-hs-g": "HS Trainer Kit (TCG)",
  "tk-hs-r": "HS Trainer Kit (TCG)",
};

const wiki = async (title) => {
  const url = `${HOST}?title=${encodeURIComponent(title.replace(/ /g, "_"))}&action=raw`;
  const res = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!res.ok) return null;
  return await res.text();
};

/** The section, plain: no templates, no links, no bold. */
const section = (text) => {
  const m = /==\s*Languages this set is released in\s*==([\s\S]*?)(?:\n==[^=]|$)/.exec(text);
  if (!m) return null;
  return m[1]
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/'''?/g, "")
    .replace(/\[https?:[^\]]*\]/g, "");
};

/**
 * The languages named in the sentences that say where the set was released.
 *
 * Only sentences naming English, which the Western release always does, and only those that say
 * "released in" or "available in": "The English release consists of four print runs" names a
 * language and says nothing about which languages exist.
 */
export function languagesIn(text) {
  if (!text) return null;
  const found = new Set();
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    if (!/\bEnglish\b/.test(sentence)) continue;
    if (!/\b(?:released|available|printed)\s+in\b/.test(sentence)) continue;
    for (const [word, code] of Object.entries(WESTERN)) {
      if (new RegExp(`\\b${word}\\b`).test(sentence)) found.add(code);
    }
  }
  if (!found.has("en")) return null;
  return Object.values(WESTERN).filter((c) => found.has(c));
}

const main = async () => {
  const write = process.argv.includes("--write");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const ids = only.length ? only : Object.keys(TITLES);
  const map = {};
  const missed = [];
  for (const id of ids) {
    const title = TITLES[id];
    if (!title) {
      missed.push(`${id}: no Bulbapedia title`);
      continue;
    }
    const text = await wiki(title);
    if (!text) {
      missed.push(`${id}: ${title} is not a page`);
      continue;
    }
    const langs = languagesIn(section(text));
    if (!langs) {
      missed.push(`${id}: ${title} has no sentence this can read`);
      continue;
    }
    map[id] = langs;
    console.log(`${id.padEnd(7)} ${langs.join(" ")}`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`\n${Object.keys(map).length} sets read, ${missed.length} not:`);
  for (const m of missed) console.log(`  ${m}`);
  if (!write) return;
  const before = await readFile(OUT, "utf8").catch(() => "{}");
  const merged = { ...JSON.parse(before), ...map };
  const sorted = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((k) => [k, merged[k]]),
  );
  await writeFile(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\nWritten: ${Object.keys(sorted).length} sets.`);
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) await main();
