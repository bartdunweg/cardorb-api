/**
 * Fills card_prices with TCGplayer's past, and replaces every Cardmarket reading in it.
 *
 * Every price the app shows is TCGplayer's since 2026-09-12, so every line under a card is too.
 * The cron recorded Cardmarket's guide from 2026-08-16 until then; `--only recent` rewrites
 * those weeks from TCGplayer's own archive and deletes the Cardmarket rows that nothing could
 * replace. The years before come from the same market, in pieces, turned into euros at each
 * day's ECB rate (frankfurter.dev, the same source lib/core/catalogue/rates.ts reads for today's):
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
 *   japanese         The same tcgcsv archive, its "Pokemon Japan" category
 *                    (85), which it carries from 2024-08-24. TCGplayer sells
 *                    the Japanese shelf too, and its set code and card number
 *                    ("m5", "103/081") are TCGdex's Japanese id (M5-103), so
 *                    the join needs no catalogue lookup at all: the map in
 *                    tcgplayer-ids.ja.generated.json is built from TCGplayer's
 *                    own group and product lists. Korean and Chinese cards
 *                    TCGplayer does not sell; their lines start with the cron.
 *
 * A card is joined to TCGplayer through TCGdex, which lists the productId under
 * pricing.tcgplayer; the join is kept in tcgplayer-ids.generated.json so the
 * 1,500 requests happen once. The archive's own files are keyed by TCGdex set
 * and card number, so they need no join at all.
 *
 *   recent           2026-08-16 up to the newest archive tcgcsv has published: every
 *                    reading the cron wrote is rewritten from that day's archive, English
 *                    and Japanese shelf, and every Saturday gets a point for every card the
 *                    id maps know, which is the day the weekly series has always been on.
 *                    Then the Cardmarket rows left over, cards TCGplayer did not price that
 *                    day, are deleted: a card with no TCGplayer figure has no point, the same
 *                    "no price" it shows. Not on --dry, and not with --limit, since a
 *                    limited run has not replaced what it would delete.
 *
 * Re-running upserts the same rows, and `recent` a second time finds nothing to delete.
 *
 *   node scripts/backfill-card-prices.mjs [--dry] [--daily] [--limit 20] [--only tcgplayer|sales|japanese|recent]
 *
 * Service role, like snapshot-collection-value.mjs and for the same reason: an
 * offline script run by a person, writing a table about cards that belongs to
 * nobody.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { pointFromTcgplayer } from "../src/lib/core/price-basis.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const IDS_JA = join(ROOT, "src", "lib", "core", "tcgplayer-ids.ja.generated.json");
const CARDMARKET_IDS = join(ROOT, "src", "lib", "core", "cardmarket-ids.generated.json");
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

/** The first day the cron wrote. The archive fills before it; `recent` rewrites from it on. */
const CRON_FROM = "2026-08-16";
/** tcgcsv's first archive. */
const TCGCSV_FROM = "2024-02-08";
/** The first archive with the Japanese category in it. */
const JAPAN_FROM = "2024-08-24";
const TCGCSV = "https://tcgcsv.com/tcgplayer";
/** TCGplayer's categories: Pokémon, and Pokémon Japan. */
const CATEGORY_EN = 3;
const CATEGORY_JA = 85;
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
    // tcgcsv answers 401 to Node's default user agent; every source here is happy to be told who asks.
    const res = await fetch(u, {
      headers: { accept: "application/json", "User-Agent": "cardorb.com" },
    });
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
 * Every card the cron prices: the ids under the latest reading, and
 * since 2026-09-11 every card of the English shelf as well — the committed id
 * map is the whole catalogue now, and a card nobody holds gets a line too. The
 * archives are TCGplayer's, an English market, so the other shelves have no
 * past to fill in; their lines start the week the cron first wrote them. Those
 * are TCGdex ids, the handle card_prices is keyed on; cards.tcg_id is not the
 * same column (it holds pokemontcg.io's id, "sv3pt5-30" for TCGdex's "sv03.5-030")
 * and a first run of this script read it and found no TCGplayer product for
 * most of the collection.
 */
async function pricedIds() {
  // The newest day anything was written, whatever the market: since `recent` there are no
  // Cardmarket rows to date the latest reading by.
  const { data: latest, error: e1 } = await db
    .from("card_prices")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (e1) throw new Error(`Reading card prices failed: ${e1.message}`);
  const date = latest?.[0]?.snapshot_date;
  if (!date) throw new Error("No reading yet: nothing to fill in before.");
  const ids = new Set(Object.keys(JSON.parse(readFileSync(CARDMARKET_IDS, "utf8"))));
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
    let refused = 0;
    await mapLimit(missing, 6, async (id) => {
      let card;
      try {
        card = await fetchJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`, {
          optional: true,
        });
      } catch {
        // A catalogue that refuses one card three times over is not a fact about the card.
        // Left out of the map rather than written as null, so the next run asks again; and
        // the run goes on, because with twenty thousand cards to ask about one refusal at
        // card 1,482 used to throw the other 20,000 answers away with it.
        refused++;
        return;
      }
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
    if (refused) console.log(`  ${refused} cards TCGdex refused; a re-run asks about them again.`);
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

/** productId → { subTypeName → marketPrice } for one day, from the archive's files of one category. */
function tcgcsvDay(date, category = CATEGORY_EN) {
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
  // Named after the process, so two runs (one shelf each) do not empty each other's folder.
  const out = join(CACHE, `x-${process.pid}`);
  rmSync(out, { recursive: true, force: true });
  execFileSync("7zz", ["x", "-y", `-o${out}`, archive, `${date}/${category}/*`], {
    stdio: "ignore",
  });
  const byProduct = new Map();
  const groups = join(out, date, String(category));
  // An archive from before the category existed has no folder for it: an empty day.
  for (const group of existsSync(groups) ? readdirSync(groups) : []) {
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
 * The two figures a row carries, from a product's printings: pointFromTcgplayer() in
 * price-basis.mjs, the rule the cron's weekly pass reads the same printings with, so a point
 * from this script and a point from the cron are the same kind of number.
 */
const pickTcgcsv = pointFromTcgplayer;

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

// ── The Japanese shelf: TCGplayer's own set codes and numbers ────────────────

/**
 * TCGdex Japanese id → TCGplayer productId, from TCGplayer's group list (its
 * abbreviation is TCGdex's set id: "m5" is M5) and each group's products (the
 * Number "103/081" is the localId "103"). Kept in tcgplayer-ids.ja.generated.json
 * and only asked about for sets not yet in it; the 459 groups are one request
 * each. An abbreviation two groups share (L2 is a set and two decks) is fine:
 * every group is read and the number decides.
 */
async function japaneseIds() {
  const known = existsSync(IDS_JA) ? JSON.parse(readFileSync(IDS_JA, "utf8")) : {};
  const sets = await fetchJson("https://api.tcgdex.net/v2/ja/sets");
  const setById = new Map(sets.map((s) => [s.id.toLowerCase(), s.id]));
  const seen = new Set(Object.keys(known).map((id) => id.slice(0, id.lastIndexOf("-"))));
  const { results: groups } = await fetchJson(`${TCGCSV}/${CATEGORY_JA}/groups`);
  const wanted = groups.filter((g) => {
    const set = setById.get((g.abbreviation ?? "").toLowerCase());
    return set && !seen.has(set);
  });
  console.log(
    `japanese: ${groups.length} TCGplayer groups, ${wanted.length} for sets not yet mapped`,
  );
  if (!wanted.length) return known;
  const cards = new Map();
  await mapLimit(
    [...new Set(wanted.map((g) => setById.get(g.abbreviation.toLowerCase())))],
    4,
    async (set) => {
      const body = await fetchJson(`https://api.tcgdex.net/v2/ja/sets/${encodeURIComponent(set)}`, {
        optional: true,
      });
      cards.set(set, new Map((body?.cards ?? []).map((c) => [c.localId, c.id])));
    },
  );
  let linked = 0;
  await mapLimit(wanted, 4, async (g) => {
    const set = setById.get(g.abbreviation.toLowerCase());
    const { results } = await fetchJson(`${TCGCSV}/${CATEGORY_JA}/${g.groupId}/products`);
    const local = cards.get(set) ?? new Map();
    for (const p of results) {
      const number = p.extendedData?.find((e) => e.name === "Number")?.value;
      if (!number) continue;
      const n = number.split("/")[0].trim();
      // "001/081" is localId "001"; a numberless promo may carry "SV-P 123" style ids too.
      const id = local.get(n) ?? local.get(String(Number(n))) ?? local.get(n.padStart(3, "0"));
      if (!id || known[id]) continue;
      known[id] = p.productId;
      linked++;
    }
  });
  const sorted = Object.fromEntries(
    Object.keys(known)
      .sort()
      .map((k) => [k, known[k]]),
  );
  writeFileSync(IDS_JA, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`  ${linked} new links, ${Object.keys(known).length} Japanese cards mapped`);
  return known;
}

// ── Recent: the weeks the cron wrote Cardmarket's figures ─────────────────────

const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** The newest day tcgcsv has an archive for; it publishes the evening's prices around 20:00 UTC. */
function newestArchive() {
  for (let d = day(new Date()), i = 0; i < 5; d = addDays(d, -1), i++) {
    try {
      execFileSync(
        "curl",
        ["-sfI", "-A", "cardorb.com", `https://tcgcsv.com/archive/tcgplayer/prices-${d}.ppmd.7z`],
        { stdio: "ignore" },
      );
      return d;
    } catch {
      // Not published yet: the day before.
    }
  }
  throw new Error("tcgcsv has published no archive in five days.");
}

/**
 * A read, three times over. The query behind these is an index scan of a few milliseconds; what
 * fails is Supabase's gateway, which answered one 504 on the first dry run (2026-09-12) and was
 * fine a second later. Writes have always had this; the reads that decide what gets deleted need
 * it more.
 */
async function retried(what, query) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await query();
    if (!result.error) return result;
    last = result.error;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`${what} failed: ${last.message}`);
}

/** Every tcg_id with a reading on one day, whatever market it is from. */
async function idsOn(date) {
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const { data } = await retried("Reading card prices", () =>
      db
        .from("card_prices")
        .select("tcg_id")
        .eq("snapshot_date", date)
        .order("tcg_id")
        .range(from, from + 999),
    );
    for (const r of data) ids.add(r.tcg_id);
    if (data.length < 1000) break;
  }
  return ids;
}

async function cardmarketRowsOn(date) {
  const { count } = await retried("Counting Cardmarket rows", () =>
    db
      .from("card_prices")
      .select("tcg_id", { count: "exact", head: true })
      .eq("snapshot_date", date)
      .eq("source", "cardmarket"),
  );
  return count ?? 0;
}

async function recent() {
  const end = newestArchive();
  const english = await tcgplayerIds(Object.keys(JSON.parse(readFileSync(CARDMARKET_IDS, "utf8"))));
  const japanese = await japaneseIds();
  const everyCard = [
    ...Object.keys(english).filter((id) => english[id]),
    ...Object.keys(japanese).filter((id) => !english[id]),
  ].slice(0, LIMIT);
  const rate = await rates(CRON_FROM, end);
  const dates = [];
  for (let d = CRON_FROM; d <= end; d = addDays(d, 1)) dates.push(d);
  console.log(
    `recent: ${dates.length} days, ${CRON_FROM} to ${end}${DRY ? " (dry run: nothing is written)" : ""}`,
  );

  let written = 0;
  let before = 0;
  for (const date of dates) {
    const r = rate.get(date);
    const held = await idsOn(date);
    before += await cardmarketRowsOn(date);
    // Saturday is the weekly series' day: every card gets a point. Any other day, the cards
    // that already had one, which is what the cron wrote.
    const wanted = dow(date) === 6 ? new Set([...everyCard, ...held]) : held;
    const en = tcgcsvDay(date, CATEGORY_EN);
    const ja = tcgcsvDay(date, CATEGORY_JA);
    const rows = [];
    for (const id of wanted) {
      const pick = english[id]
        ? pickTcgcsv(en.get(english[id].productId))
        : japanese[id]
          ? pickTcgcsv(ja.get(japanese[id]))
          : null;
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
    console.log(`  ${date}: ${rows.length} of ${wanted.size} cards priced`);
    show(rows);
  }
  console.log(
    `${DRY ? "Would write" : "Wrote"} ${written} TCGplayer readings over ${before} Cardmarket ones.`,
  );

  // Only after every day above wrote, and never on a partial run: what is left is what TCGplayer
  // could not replace, and a limited or dry run has not tried to replace it.
  if (DRY || LIMIT !== Infinity) {
    console.log("Cardmarket rows left in place (dry or limited run).");
    return;
  }
  let deleted = 0;
  for (const date of dates) {
    const left = await cardmarketRowsOn(date);
    if (!left) continue;
    await retried(`Deleting Cardmarket rows on ${date}`, () =>
      db.from("card_prices").delete().eq("snapshot_date", date).eq("source", "cardmarket"),
    );
    deleted += left;
  }
  const { count: remaining } = await retried("Counting Cardmarket rows", () =>
    db
      .from("card_prices")
      .select("tcg_id", { count: "exact", head: true })
      .eq("source", "cardmarket"),
  );
  console.log(
    `Deleted ${deleted} Cardmarket rows TCGplayer had no figure for. Cardmarket rows left: ${remaining}.`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (ONLY === "recent") {
  await recent();
  process.exit(0);
}

if (ONLY === "japanese") {
  const products = await japaneseIds();
  const ids = Object.keys(products).slice(0, LIMIT);
  const rate = await rates(JAPAN_FROM, addDays(CRON_FROM, -1));
  const step = DAILY ? 1 : 7;
  const dates = [];
  for (let d = addDays(CRON_FROM, -1); d >= JAPAN_FROM; d = addDays(d, -step)) dates.push(d);
  dates.reverse();
  console.log(`tcgcsv japan: ${dates.length} days, ${dates[0]} to ${dates[dates.length - 1]}`);
  let written = 0;
  for (const date of dates) {
    const r = rate.get(date);
    const prices = tcgcsvDay(date, CATEGORY_JA);
    const rows = [];
    for (const id of ids) {
      const pick = pickTcgcsv(prices.get(products[id]));
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
  console.log(`${DRY ? "Would write" : "Wrote"} ${written} readings.`);
  process.exit(0);
}

const ids = (await pricedIds()).slice(0, LIMIT);
console.log(`${ids.length} cards${DRY ? " (dry run: nothing is written)" : ""}`);
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
