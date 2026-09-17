/**
 * English release dates to the day, off Bulbapedia's set pages, into
 * src/lib/core/catalogue/release-dates.generated.json. The copy lays them over TCGdex's (correctedSet in
 * set-corrections.ts), and data-health.mjs fails on a set whose date still looks like a placeholder.
 *
 * TCGdex dates about forty sets before Black & White to the first of their month: Diamond & Pearl
 * 2007/05/01 for May 23, 2007, Legends Awakened 2008/08/01 for August 20, 2008 (source audit,
 * 2026-09-17). TCGplayer is right for those two and wrong for older sets (Gym Heroes two months late),
 * pokemontcg.io uses the same placeholders, and Bulbapedia's infobox gives the day for each. So:
 *
 *   - dates: a set released before Black & White (2011/04/25) whose TCGdex date is a first of the
 *     month, where Bulbapedia's infobox gives the day. Bulbapedia's day is the set's date.
 *   - firstOfMonth: a set from Black & White on dated a first, where Bulbapedia says that day too
 *     (Rebel Clash, 2020/05/01). TCGdex stands, confirmed.
 *   - noDay: a set dated a first that Bulbapedia gives no day for, with why (a promo line has no one
 *     release day). Reported, not failed.
 *   - A set from Black & White on where Bulbapedia names another day is printed for a person to
 *     decide, and left as TCGdex has it.
 *
 * Bulbapedia refuses GitHub's runners, so this runs on a person's machine and the file is committed.
 * Read-only on the database; Bulbapedia is asked as scripts/bulbapedia-wiki.mjs asks it. Only a date is
 * kept, never Bulbapedia's text.
 *
 *   SUPABASE_CLI=… SUPABASE_WORKDIR=… node scripts/release-dates.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { infoboxDate } from "../src/lib/core/catalogue/bulbapedia-setlist.mjs";
import { ROOT, pageInfo, pageTexts, query } from "./bulbapedia-wiki.mjs";

const CATALOGUE = join(ROOT, "src", "lib", "core", "catalogue");
const OUT = join(CATALOGUE, "release-dates.generated.json");
const DRY = process.argv.includes("--dry");
/** Black & White, the first set TCGdex dates to the day throughout. */
const BLACK_AND_WHITE = "2011/04/25";

const mapping = JSON.parse(readFileSync(join(CATALOGUE, "bulbapedia-sets.json"), "utf8"));
const previous = (() => {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return { dates: {}, firstOfMonth: [], noDay: {} };
  }
})();

/* The sets to look at: every English set the copy dates to a first, and every set this file has
   dated before (the copy holds Bulbapedia's day for those now, so its first is gone). */
const sets = (
  await query(
    "select id, name, release_date::text as release_date from catalogue_sets where language = 'en' order by release_date, id",
  )
).filter(
  (s) =>
    String(s.release_date ?? "").endsWith("/01") ||
    s.id in previous.dates ||
    previous.firstOfMonth.includes(s.id) ||
    s.id in previous.noDay,
);
const pageOf = (id) => mapping.find((m) => m.language === "en" && m.id === id);
const info = await pageInfo(sets.map((s) => pageOf(s.id)?.page).filter(Boolean));
const { texts } = await pageTexts(new Map([...info].filter(([, p]) => p)));

const out = { dates: {}, firstOfMonth: [], noDay: {} };
const toDecide = [];
for (const set of sets) {
  /* The date TCGdex gave, where the copy already holds this file's: the one the last run saw. */
  const tcgdex = previous.dates[set.id]?.tcgdex ?? set.release_date;
  const map = pageOf(set.id);
  const text = map?.page ? texts.get(info.get(map.page)?.title ?? "") : null;
  const day = text ? infoboxDate(text) : null;
  if (!day) {
    out.noDay[set.id] = map?.page
      ? `Bulbapedia's page "${map.page}" gives no English release day`
      : `no Bulbapedia page (${map?.reason ?? "not mapped"})`;
    continue;
  }
  if (tcgdex < BLACK_AND_WHITE) out.dates[set.id] = { date: day, tcgdex };
  else if (day === tcgdex) out.firstOfMonth.push(set.id);
  else toDecide.push(`${set.id} ${set.name}: TCGdex ${tcgdex}, Bulbapedia ${day}`);
}

const moved = Object.entries(out.dates).filter(([, d]) => d.date !== d.tcgdex);
console.error(
  `${sets.length} sets: ${Object.keys(out.dates).length} dated from Bulbapedia (${moved.length} moved), ${out.firstOfMonth.length} confirmed on the first, ${Object.keys(out.noDay).length} with no day`,
);
for (const [id, d] of moved) console.error(`  ${id}: ${d.tcgdex} -> ${d.date}`);
console.error(
  `to decide (Black & White on, Bulbapedia names another day): ${toDecide.join("; ") || "none"}`,
);
if (!DRY) writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
