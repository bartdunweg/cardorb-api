/**
 * Fills card_prices with the years before the nightly cron existed.
 *
 * The cron has recorded Cardmarket's guide since 2026-08-16. Nobody publishes
 * Cardmarket's past, so the past comes from the American market instead, in two
 * pieces, and is turned into euros at each day's ECB rate (frankfurter.dev, the
 * same source lib/core/catalogue/rates.ts reads for today's):
 *
 *   tcgplayer        tcgcsv.com's daily archive of TCGplayer's market price,
 *                    from 2024-02-08. One 7z a day, every game inside; the
 *                    Pokémon part is read and the rest left packed. Weekly by
 *                    default (a chart over years does not need every day),
 *                    --daily for all of it.
 *   tcgplayer-sales  tcgdex/price-history on GitHub, TCGplayer sales per card
 *                    per day from 2022-11 to 2024-09, older sets only. Averaged
 *                    per week, Near Mint and Lightly Played together, because a
 *                    single sale is not a price. Used for the weeks before
 *                    tcgcsv starts.
 *
 * A card is joined to TCGplayer through TCGdex, which lists the productId under
 * pricing.tcgplayer; the join is kept in tcgplayer-ids.generated.json so the
 * 1,500 requests happen once. The archive's own files are keyed by TCGdex set
 * and card number, so they need no join at all.
 *
 * Writes only dates before the cron's first reading: a backfill fills in, it
 * never rewrites a Cardmarket reading. Re-running upserts the same rows.
 *
 *   node scripts/backfill-card-prices.mjs [--dry] [--daily] [--limit 20] [--only tcgplayer|sales]
 *
 * Service role, like snapshot-collection-value.mjs and for the same reason: an
 * offline script run by a person, writing a table about cards that belongs to
 * nobody.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const CACHE = join(ROOT, ".cache", "tcgcsv");

for (const file of [".env.local", ".env"]) {
  const path = `${ROOT}${file}`;
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const DRY = args.includes("--dry");
const DAILY = args.includes("--daily");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;
const ONLY = flag("--only");
/** Print the first rows of each source, to read a sample before trusting a run. */
const VERBOSE = args.includes("--verbose");
const show = (rows) => {
  if (VERBOSE) for (const r of rows.slice(0, 4)) console.log("   ", JSON.stringify(r));
};

/** The first day the cron wrote; nothing on or after it is touched. */
const CRON_FROM = "2026-08-16";
/** tcgcsv's first archive. */
const TCGCSV_FROM = "2024-02-08";
/** The oldest sale in tcgdex/price-history. */
const SALES_FROM = "2022-11-01";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (.env.local).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => day(new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000));
/** The Monday of the week an ISO date falls in. */
const weekOf = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -shift);
};

async function fetchJson(u, { optional = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(u, { headers: { accept: "application/json" } });
    if (res.status === 404 && optional) return null;
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${u}: ${res.status}`);
  }
  throw new Error(`${u}: gave up`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ── The cards ────────────────────────────────────────────────────────────────

/**
 * Every card the cron prices: the ids under the latest Cardmarket reading. Those
 * are TCGdex ids, the handle card_prices is keyed on; cards.tcg_id is not the
 * same column (it holds pokemontcg.io's id, "sv3pt5-30" for TCGdex's "sv03.5-030")
 * and a first run of this script read it and found no TCGplayer product for
 * most of the collection.
 */
async function heldIds() {
  const { data: latest, error: e1 } = await db
    .from("card_prices")
    .select("snapshot_date")
    .eq("source", "cardmarket")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (e1) throw new Error(`Reading card prices failed: ${e1.message}`);
  const date = latest?.[0]?.snapshot_date;
  if (!date) throw new Error("No Cardmarket reading yet: nothing to fill in before.");
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("card_prices")
      .select("tcg_id")
      .eq("snapshot_date", date)
      .range(from, from + 999);
    if (error) throw new Error(`Reading card prices failed: ${error.message}`);
    for (const r of data) ids.add(r.tcg_id);
    if (data.length < 1000) break;
  }
  return [...ids].sort();
}

/**
 * tcgId → { productId, variants: ["normal", "holofoil", ...] } from TCGdex, once.
 * A card TCGdex prices on no TCGplayer product gets null and no history.
 */
async function tcgplayerIds(ids) {
  const known = existsSync(IDS) ? JSON.parse(readFileSync(IDS, "utf8")) : {};
  const missing = ids.filter((id) => !(id in known));
  if (missing.length) {
    console.log(`Asking TCGdex for ${missing.length} TCGplayer ids…`);
    await mapLimit(missing, 6, async (id) => {
      const card = await fetchJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`, {
        optional: true,
      });
      const t = card?.pricing?.tcgplayer;
      const variants = t
        ? Object.entries(t).filter(([, v]) => v && typeof v === "object" && v.productId)
        : [];
      known[id] = variants.length
        ? { productId: variants[0][1].productId, variants: variants.map(([k]) => k) }
        : null;
    });
    // Sorted by id so a rerun's diff is the new cards alone.
    const sorted = Object.fromEntries(
      Object.keys(known)
        .sort()
        .map((k) => [k, known[k]]),
    );
    writeFileSync(IDS, `${JSON.stringify(sorted, null, 2)}\n`);
  }
  return known;
}

// ── Dollars into euros ───────────────────────────────────────────────────────

/** date → EUR per USD, the ECB's reference rate; a weekend or holiday takes the last rate before it. */
async function rates(from, to) {
  const body = await fetchJson(`https://api.frankfurter.dev/v1/${from}..${to}?from=USD&to=EUR`);
  const known = body.rates;
  const out = new Map();
  let last = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (known[d]?.EUR) last = known[d].EUR;
    if (last) out.set(d, last);
  }
  return out;
}

const cents = (usd, rate) => (usd == null || !(usd > 0) ? null : Math.round(usd * rate * 100));

// ── tcgcsv: TCGplayer's market price, a day at a time ────────────────────────

/** productId → { subTypeName → marketPrice } for one day, from the archive's Pokémon files. */
function tcgcsvDay(date) {
  mkdirSync(CACHE, { recursive: true });
  const archive = join(CACHE, `prices-${date}.ppmd.7z`);
  if (!existsSync(archive)) {
    execFileSync("curl", [
      "-sfL",
      "-o",
      archive,
      `https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`,
    ]);
  }
  const out = join(CACHE, "x");
  rmSync(out, { recursive: true, force: true });
  execFileSync("7zz", ["x", "-y", `-o${out}`, archive, `${date}/3/*`], { stdio: "ignore" });
  const byProduct = new Map();
  const groups = join(out, date, "3");
  for (const group of readdirSync(groups)) {
    const file = join(groups, group, "prices");
    if (!existsSync(file)) continue;
    const { results } = JSON.parse(readFileSync(file, "utf8"));
    for (const r of results) {
      if (!(r.marketPrice > 0)) continue;
      const m = byProduct.get(r.productId) ?? new Map();
      m.set(r.subTypeName, r.marketPrice);
      byProduct.set(r.productId, m);
    }
  }
  rmSync(out, { recursive: true, force: true });
  return byProduct;
}

/**
 * The two figures a row carries, from a product's printings. The same rule as
 * the API's variantPrice: the plain printing is the market price, the foil is
 * the holo price; a card printed only as a holo is priced on that.
 */
function pickTcgcsv(printings) {
  if (!printings) return null;
  const normal = printings.get("Normal") ?? null;
  const holo = printings.get("Holofoil") ?? printings.get("1st Edition Holofoil") ?? null;
  const reverse = printings.get("Reverse Holofoil") ?? null;
  const market = normal ?? holo;
  if (market == null) return null;
  return { market, holo: reverse ?? (normal != null ? holo : null) };
}

// ── tcgdex/price-history: sales, averaged per week ───────────────────────────

const RAW = "https://raw.githubusercontent.com/tcgdex/price-history/master/en";
/** The conditions that count as a price; a Played or Poor sale says little about the card's value. */
const CONDITIONS = new Set(["nearmint", "good"]);

/** One card's weekly averages per printing, USD cents: week → { normal?, holo?, reverse? }. */
async function salesWeeks(tcgId) {
  const dash = tcgId.lastIndexOf("-");
  const set = tcgId.slice(0, dash);
  const local = tcgId.slice(dash + 1);
  const n = /^\d+$/.test(local) ? String(Number(local)) : local;
  const file = await fetchJson(`${RAW}/${set}/${n}.tcgplayer.json`, { optional: true });
  if (!file?.data) return null;
  const weeks = new Map();
  for (const [bucket, { history }] of Object.entries(file.data)) {
    const cut = bucket.lastIndexOf("-");
    const printing = bucket.slice(0, cut);
    const condition = bucket.slice(cut + 1);
    if (!CONDITIONS.has(condition) || !history) continue;
    for (const [date, sale] of Object.entries(history)) {
      if (date >= TCGCSV_FROM || !(sale.count > 0)) continue;
      const w = weekOf(date);
      const week = weeks.get(w) ?? {};
      const acc = week[printing] ?? { sum: 0, count: 0 };
      acc.sum += sale.avg * sale.count;
      acc.count += sale.count;
      week[printing] = acc;
      weeks.set(w, week);
    }
  }
  const out = new Map();
  for (const [w, week] of weeks) {
    const avg = (p) => (week[p] && week[p].count >= 2 ? week[p].sum / week[p].count / 100 : null);
    const normal = avg("normal");
    const holo = avg("holo");
    const reverse = avg("reverse");
    const market = normal ?? holo;
    if (market == null) continue;
    out.set(w, { market, holo: reverse ?? (normal != null ? holo : null) });
  }
  return out;
}

// ── Writing ──────────────────────────────────────────────────────────────────

async function write(rows) {
  if (!rows.length) return;
  if (DRY) return;
  for (let i = 0; i < rows.length; i += 500) {
    // A dropped connection halfway through a long run is a retry, not a restart.
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await db
        .from("card_prices")
        .upsert(rows.slice(i, i + 500), { onConflict: "tcg_id,snapshot_date" });
      last = error;
      if (!error) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (last) throw new Error(`Writing card prices failed: ${last.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const ids = (await heldIds()).slice(0, LIMIT);
console.log(`${ids.length} held cards${DRY ? " (dry run: nothing is written)" : ""}`);
const products = await tcgplayerIds(ids);
const withProduct = ids.filter((id) => products[id]);
console.log(`${withProduct.length} of them have a TCGplayer product`);
const rate = await rates(SALES_FROM, addDays(CRON_FROM, -1));

let written = 0;

if (ONLY !== "sales") {
  const step = DAILY ? 1 : 7;
  // Ending on the cron's eve, so the last archive read sits right against the first reading.
  const dates = [];
  for (let d = addDays(CRON_FROM, -1); d >= TCGCSV_FROM; d = addDays(d, -step)) dates.push(d);
  dates.reverse();
  console.log(`tcgcsv: ${dates.length} days, ${TCGCSV_FROM} to ${dates[dates.length - 1]}`);
  for (const date of dates) {
    const r = rate.get(date);
    const prices = tcgcsvDay(date);
    const rows = [];
    for (const id of withProduct) {
      const pick = pickTcgcsv(prices.get(products[id].productId));
      if (!pick) continue;
      rows.push({
        tcg_id: id,
        snapshot_date: date,
        market_cents: cents(pick.market, r),
        holo_cents: cents(pick.holo, r),
        source: "tcgplayer",
      });
    }
    await write(rows);
    written += rows.length;
    console.log(`  ${date}: ${rows.length} cards`);
    show(rows);
  }
}

if (ONLY !== "tcgplayer") {
  console.log(`sales: ${ids.length} cards to look up`);
  let found = 0;
  const batches = await mapLimit(ids, 6, async (id) => {
    const weeks = await salesWeeks(id);
    if (!weeks) return [];
    found += 1;
    const rows = [];
    for (const [week, pick] of weeks) {
      const r = rate.get(week);
      if (!r) continue;
      rows.push({
        tcg_id: id,
        snapshot_date: week,
        market_cents: cents(pick.market, r),
        holo_cents: cents(pick.holo, r),
        source: "tcgplayer-sales",
      });
    }
    return rows;
  });
  const rows = batches.flat();
  show(rows.filter((r) => r.tcg_id === "base1-4"));
  await write(rows);
  written += rows.length;
  console.log(`  ${found} cards in the archive, ${rows.length} weekly readings`);
}

console.log(`${DRY ? "Would write" : "Wrote"} ${written} readings.`);
