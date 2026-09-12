/**
 * Adds the English cards TCGdex has published since the last run to tcgplayer-ids.generated.json,
 * with the TCGplayer product TCGdex relays for each, or null where it relays none.
 *
 * The map is what Browse, search, the weekly price pass and the history read a card's TCGplayer
 * product from. A card missing from it has no price on its set's page, and until 2026-09-12 the
 * only way in was backfill-card-prices.mjs, which needs the database's service key and so could
 * not run anywhere but a person's machine. This needs nothing but TCGdex: every English set's card
 * list, and one request for each card not in the map yet.
 *
 * Never changes a card already in the map; tcgplayer-links.mjs fills the nulls afterwards.
 *
 *   node scripts/tcgplayer-ids.mjs [--dry]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
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

const ids = JSON.parse(readFileSync(IDS, "utf8"));
const sets = (await fetchJson("https://api.tcgdex.net/v2/en/sets")) ?? [];
const lists = await mapLimit(sets, 6, (s) =>
  fetchJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`),
);
const fresh = lists
  .flatMap((set) => (set?.cards ?? []).map((c) => c.id))
  .filter((id) => !(id in ids));
console.log(`${sets.length} sets, ${fresh.length} cards not in the map yet`);

let refused = 0;
await mapLimit(fresh, 6, async (id) => {
  let card;
  try {
    card = await fetchJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`);
  } catch {
    // Left out rather than written as null, so the next run asks again.
    refused++;
    return;
  }
  const t = card?.pricing?.tcgplayer;
  const variants = t
    ? Object.entries(t).filter(([, v]) => v && typeof v === "object" && v.productId)
    : [];
  ids[id] = variants.length
    ? { productId: variants[0][1].productId, variants: variants.map(([k]) => k) }
    : null;
});
if (refused) console.log(`${refused} cards TCGdex refused; the next run asks again.`);

if (!DRY) {
  const sorted = Object.fromEntries(
    Object.keys(ids)
      .sort()
      .map((k) => [k, ids[k]]),
  );
  writeFileSync(IDS, `${JSON.stringify(sorted, null, 2)}\n`);
}
console.log(`${DRY ? "Would add" : "Added"} ${fresh.length - refused} cards.`);
