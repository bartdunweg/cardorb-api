/**
 * Which sets of the Japanese, Korean and Chinese shelves TCGdex has cards for.
 *
 * The shelf lists every set TCGdex knows, and a set with a count and no card behind it reads as
 * "No cards in the catalogue yet" rather than as a set to open (tcgdex-browse.ts, recordedSets).
 * Asking every set live is a request each, 184 for the Japanese shelf, so the answer is committed
 * here and read on the page. It was read off the Cardmarket id maps until 2026-09-12, which listed
 * every card; those went with Cardmarket, and this reads the same fact from TCGdex directly.
 *
 * Run it when a set is added to one of those shelves.
 *
 *   node scripts/recorded-sets.mjs [--dry]
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(
  new URL("..", import.meta.url).pathname,
  "src",
  "lib",
  "core",
  "recorded-sets.generated.json",
);
const LANGUAGES = ["ja", "ko", "zh-cn", "zh-tw"];
const DRY = process.argv.includes("--dry");

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`${url}: gave up`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const out = {};
for (const lang of LANGUAGES) {
  const sets = (await fetchJson(`https://api.tcgdex.net/v2/${lang}/sets`)) ?? [];
  const withCards = await mapLimit(sets, 6, async (s) => {
    const set = await fetchJson(
      `https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(s.id)}`,
    );
    return set?.cards?.length ? s.id : null;
  });
  out[lang] = withCards.filter(Boolean).sort();
  console.log(`${lang}: ${sets.length} sets, ${out[lang].length} with cards`);
}
if (!DRY) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
