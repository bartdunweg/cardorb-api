/**
 * What the binder was worth, one dated point at a time, into
 * lib/collection-value.generated.json.
 *
 *   npm run build && npx next start -p 3111    # in another shell
 *   node scripts/snapshot-collection-value.mjs
 *   node scripts/snapshot-collection-value.mjs --seed   # add the archived points too
 *
 * Why a snapshot rather than a lookup: nobody publishes the history. Cardmarket's
 * API answers with today's price plus its own 1, 7 and 30 day averages and no
 * series, and it has been closed to new applications anyway (see the note on
 * NM_BANDS in lib/price-basis.mjs, which ran into the same wall). TCGdex' free
 * price-history repo is TCGplayer in dollars, covers 745 of this collection's
 * 1,553 cards, and stopped in June 2025. So the series does not exist to be
 * fetched. It has to be recorded, and every run of this file records one point.
 *
 * The past is not completely lost, which is what --seed is for. Cardmarket
 * publishes its whole price guide as one public file, and the Internet Archive
 * happens to hold two old copies of it. That is three real points rather than
 * one, and the earliest is December 2024. Two, because that is how many there
 * are; there is no daily archive of this file anywhere, so do not go looking for
 * a fourth.
 *
 * Two things are being combined, and both are needed for the question to mean
 * anything. The prices come from the guide. *Which cards were in the binder on
 * that date* comes from Notion's created_time, because valuing today's 1,622
 * cards at 2024 prices would answer a question nobody asked: 92% of the
 * collection already existed a year ago, so over recent months the series is
 * almost entirely market movement, and over the earlier ones it is almost
 * entirely buying.
 *
 * It reads the running production build for the one thing neither source has, a
 * card's TCGdex id, the same way scripts/localise-images.mjs reads the built site
 * rather than reimplementing what it already does. Notion knows a card as a set
 * name and a number; Cardmarket knows it as an idProduct; TCGdex is the only
 * thing that joins them, and lib/cards.ts already does that matching properly,
 * subsets and zero-padding and all. Doing it a second time here would be a second
 * source of truth that goes wrong quietly.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { priceOf, shownPrice } from "../lib/price-basis.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "lib", "collection-value.generated.json");
/** tcgId -> Cardmarket idProduct. Cached because it costs 1,553 requests and never moves. */
const IDS = join(ROOT, "lib", "cardmarket-ids.generated.json");

const BASE = process.env.SITE ?? "http://127.0.0.1:3111";
const SEED = process.argv.includes("--seed");
const NOTION_DB = "cfae17e0-bdab-4ca0-9b27-d3baac32b2ae";

/** 6 is Pokémon in Cardmarket's game table. Public, no login, rebuilt nightly. */
const GUIDE = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";

/**
 * The only two copies of that file the Internet Archive has, checked with their
 * CDX index. `id_` in the path asks for the bytes as captured rather than the
 * archive's rewritten version.
 */
const ARCHIVED = [
  "https://web.archive.org/web/20241230185748id_/" + GUIDE,
  "https://web.archive.org/web/20260617212111id_/" + GUIDE,
];

const get = async (url, what, headers = {}) => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", ...headers } });
  if (!res.ok) throw new Error(`${what}: ${res.status}`);
  return res;
};

/**
 * Every card the site shows, as the key it files it under and the TCGdex id it
 * resolved to.
 *
 * The RSC payload rather than the HTML: asking for the page with an `RSC` header
 * returns the flight payload on its own, which is the same props CardsView is
 * handed and is already JSON-shaped. Scraping the rendered markup would only get
 * back what is on screen, and /cards opens on its dashboard.
 */
async function cardsFromBuild() {
  // The RSC header asks for the flight payload on its own. Without it Next
  // answers with the HTML, which carries the same payload escaped inside a
  // script tag and would need unescaping before any of it could be read.
  const flight = await (await get(`${BASE}/cards`, "/cards", { RSC: "1" })).text();
  const cards = new Map();
  for (const m of flight.matchAll(/"key":"((?:[^"\\]|\\.)*)"[\s\S]{0,400}?"tcgId":("[^"]*"|null)/g)) {
    const key = JSON.parse(`"${m[1]}"`);
    const tcgId = JSON.parse(m[2]);
    if (tcgId) cards.set(key, tcgId);
  }
  if (cards.size < 500) {
    throw new Error(
      `only ${cards.size} cards found in the flight payload. Is 3111 a production build of the current code?`,
    );
  }
  return cards;
}

/**
 * When each card first appeared in the binder, and whether it is held or wanted.
 *
 * created_time is Notion's own, not a field Bart fills in, which is exactly why
 * it is trustworthy here: it is the moment the row was made, and rows get made
 * when a pack is opened. Spread over 26 months, so it is a real timeline rather
 * than one bulk import.
 *
 * Keyed the way lib/cards.ts keys a card, set name and number, so a card held
 * twice (normal and reverse holo) is one entry. Its date is the earlier of the
 * two rows: the card entered the binder when the first copy did.
 */
async function fromNotion() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set, so there is no telling when anything arrived");
  const rows = [];
  let cursor;
  for (let page = 0; page < 30; page++) {
    const r = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!r.ok) throw new Error(`Notion query: ${r.status}`);
    const body = await r.json();
    rows.push(...(body.results ?? []));
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }

  const text = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
  const cards = new Map();
  for (const row of rows) {
    const props = row.properties ?? {};
    const set = props.Set?.select?.name;
    const number = text(props.Number);
    const name = text(props.Name);
    if (!set) continue;
    const key = `${set}-${number || name}`;
    const acquired = row.created_time.slice(0, 10);
    const owned = props.Collection?.checkbox !== false;
    const prev = cards.get(key);
    if (prev) {
      if (acquired < prev.acquired) prev.acquired = acquired;
      prev.owned ||= owned;
    } else {
      cards.set(key, { acquired, owned });
    }
  }
  return cards;
}

/** tcgId -> idProduct, asking TCGdex only for the ones the cache has never seen. */
async function cardmarketIds(tcgIds) {
  const cache = existsSync(IDS) ? JSON.parse(readFileSync(IDS, "utf8")) : {};
  const missing = tcgIds.filter((id) => !(id in cache));
  if (missing.length) {
    console.log(`  resolving ${missing.length} Cardmarket ids from TCGdex`);
    let next = 0;
    await Promise.all(
      Array.from({ length: 16 }, async () => {
        while (next < missing.length) {
          const id = missing[next++];
          try {
            const card = await (await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`)).json();
            // null rather than absent for a card Cardmarket has no product for,
            // so the next run does not ask again about a card that has no answer.
            cache[id] = card?.pricing?.cardmarket?.idProduct ?? null;
          } catch {
            // Left out of the cache entirely, so a network blip is retried next
            // run rather than remembered as "this card has no price".
          }
        }
      }),
    );
    writeFileSync(IDS, JSON.stringify(sortKeys(cache), null, 2) + "\n");
  }
  return cache;
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/**
 * One dated point: what the cards that were in the binder by then were worth at
 * that day's prices.
 *
 * Through priceOf and shownPrice, the same two functions /cards and its dashboard
 * use, so this total and the one on the dashboard are the same kind of number.
 * Owned only, on the same grounds getCardsStats uses: a wishlist is not a
 * holding.
 *
 * `unpriced` is not noise worth hiding. In the December 2024 guide most of it is
 * cards from sets that had not been printed yet, which is the honest reason an
 * old point counts fewer cards, and the page should be able to say so.
 */
function valueAt(guide, cards, ids, acquisitions) {
  const byProduct = new Map(guide.priceGuides.map((r) => [r.idProduct, r]));
  const on = guide.createdAt.slice(0, 10);
  let value = 0;
  let priced = 0;
  let unpriced = 0;
  let held = 0;
  for (const [key, tcgId] of cards) {
    const mine = acquisitions.get(key);
    if (!mine || !mine.owned || mine.acquired > on) continue;
    held++;
    const row = byProduct.get(ids[tcgId]);
    const p = row && priceOf({ low: row.low, trend: row.trend, avg30: row.avg30 });
    const n = p && shownPrice(p);
    if (n == null) {
      unpriced++;
      continue;
    }
    value += n;
    priced++;
  }
  return { date: on, value: Math.round(value), cards: held, priced, unpriced };
}

const guideFrom = async (url, what) => {
  console.log(`  ${what}`);
  return (await get(url, what)).json();
};

const cards = await cardsFromBuild();
console.log(`/cards: ${cards.size} cards with a TCGdex id`);
const acquisitions = await fromNotion();
console.log(`Notion: ${acquisitions.size} cards with a date`);
const ids = await cardmarketIds([...cards.values()]);

const guides = [await guideFrom(GUIDE, "Cardmarket price guide, today")];
if (SEED) {
  for (const url of ARCHIVED) guides.push(await guideFrom(url, `archived: ${url.slice(28, 42)}`));
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).snapshots : [];
const byDate = new Map(existing.map((s) => [s.date, s]));
for (const guide of guides) {
  const point = valueAt(guide, cards, ids, acquisitions);
  byDate.set(point.date, point);
  console.log(
    `${point.date}  €${point.value.toLocaleString("en-GB")}  ${point.priced} of ${point.cards} cards priced`,
  );
}

const snapshots = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(OUT, JSON.stringify({ snapshots }, null, 2) + "\n");
console.log(`\n${OUT}: ${snapshots.length} points, ${snapshots[0].date} to ${snapshots.at(-1).date}`);
