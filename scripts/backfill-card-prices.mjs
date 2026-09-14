/**
 * Fills the price history with TCGplayer's past, a month to a row (card_price_months).
 *
 * Every price the app shows is TCGplayer's since 2026-09-12, so every line under a card is too.
 * Since 2026-09-13 prices are stored a month to a row, so every English card can have every day on
 * the free plan (price-months.mjs); `--only daily` fills that. The years before come from the same market, in pieces, turned into euros at each
 * day's ECB rate (frankfurter.dev, the same source lib/core/catalogue/rates.ts reads for today's):
 *
 *   tcgplayer        tcgcsv.com's daily archive of TCGplayer's market price,
 *                    from 2024-02-08. One 7z a day, every game inside; the
 *                    Pokémon part is read and the rest left packed. Weekly by
 *                    default (a chart over years does not need every day),
 *                    --daily for all of it.
 *
 *   Nothing older is written. tcgdex/price-history's sales averages (2022-11 to 2023-11, 451
 *   cards, a source with no sale from December 2023 to February 2024) were read here until
 *   2026-09-14 and removed with that day's migration (Bart): one kind of figure from 2024-02-08.
 *   japanese         The same tcgcsv archive, its "Pokemon Japan" category
 *                    (85), which it carries from 2024-08-24. TCGplayer sells
 *                    the Japanese shelf too, and its set code and card number
 *                    ("m5", "103/081") are TCGdex's Japanese id (M5-103), so
 *                    the join needs no catalogue lookup at all: the map in
 *                    tcgplayer-ids.ja.generated.json is built from TCGplayer's
 *                    own group and product lists.
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
 *                    (The Cardmarket rows it used to delete afterwards are gone since
 *                    2026-09-12, and so is that step.)
 *
 * Re-running merges the same days again: a day written twice keeps the later figure.
 *
 *   daily            Every English card from 2024-02-08 to tcgcsv's newest archive, a month to
 *                    a row: every day of the last six months, one a week (the Saturday) before,
 *                    as the price job keeps them. `--from` and `--to` resume a stopped run;
 *                    `--ids a,b` fills only those cards, for ones linked since.
 *
 *   node scripts/backfill-card-prices.mjs [--dry] [--daily] [--limit 20] [--only tcgplayer|japanese|recent|daily] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *   `--only japanese --copied-only` fills only the Japanese cards the copy matched and the map does not name.
 *
 * Months older than six months are thinned to one figure a week since 2026-09-14 (migration
 * 20260914150000, thin_oldest_price_month, called by the tcgplayer-prices cron). Do not send those
 * months again: upsert_card_price_months merges days, so a re-sent month fills its days back in
 * and is never thinned a second time. Keep `--from` within the last six months.
 *
 * Service role, because there is nobody to be: an
 * offline script run by a person, writing a table about cards that belongs to
 * nobody.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { pointFromTcgplayer } from "../src/lib/core/price-basis.mjs";
import {
  legacyDays,
  monthsFromDays,
  printingKey,
  shadowlessKey,
} from "../src/lib/core/price-months.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const IDS = join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json");
const IDS_JA = join(ROOT, "src", "lib", "core", "tcgplayer-ids.ja.generated.json");
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
  const ids = new Set(Object.keys(JSON.parse(readFileSync(IDS, "utf8"))));
  for (const id of (await heldNow()).ids) ids.add(id);
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
  // Asked from a week earlier, so a first day on a weekend has Friday's rate to stand on. From
  // Sunday 2026-08-16 itself the first rate was Monday's, and every `--only recent` reading of
  // 08-16 was written without a figure.
  const body = await fetchJson(
    `https://api.frankfurter.dev/v1/${addDays(from, -7)}..${to}?from=USD&to=EUR`,
  );
  const known = body.rates;
  const out = new Map();
  let last = null;
  for (let d = addDays(from, -7); d <= to; d = addDays(d, 1)) {
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

// ── Writing ──────────────────────────────────────────────────────────────────

/**
 * Readings written a printing-month to a row (card_price_months, since 2026-09-13), merged into
 * what is stored: a day sent replaces that day and a day not sent stays.
 *
 * `write` takes the two old series in cents, which is what the weekly and Japanese sources
 * below build; they are stored as the printings 'market' and 'holo'. `writeDays` takes printing
 * days in euros, which is what `daily` builds.
 */
async function write(rows) {
  await writeDays(
    rows.flatMap((r) =>
      legacyDays({
        tcgId: r.tcg_id,
        date: r.snapshot_date,
        market: r.market_cents == null ? null : r.market_cents / 100,
        holo: r.holo_cents == null ? null : r.holo_cents / 100,
        source: r.source,
      }),
    ),
  );
}

async function writeDays(days) {
  if (!days.length) return;
  if (DRY) return;
  const months = monthsFromDays(days);
  for (let i = 0; i < months.length; i += 1000) {
    // A dropped connection halfway through a long run is a retry, not a restart.
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await db.rpc("upsert_card_price_months", {
        p_rows: months.slice(i, i + 1000),
      });
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

/** Every tcg_id with a reading on one day. */
async function idsOn(date) {
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const { data } = await retried("Reading card prices", () =>
      db.rpc("card_ids_priced_on", { p_date: date }).range(from, from + 999),
    );
    for (const id of data) ids.add(id);
    if (data.length < 1000) break;
  }
  return ids;
}

/**
 * The cards held now, as the cron last priced them on a night that was not the weekly pass: every
 * copy in every collection, by the id the cron resolved it to. The nightly series only ever priced
 * the cards held on the night, so a card linked to TCGplayer later (the promos and subsets of
 * cardorb-api#358 and #371) had a Saturday reading and nothing between, and the Home line counted
 * it as unpriced six days a week. Cards bought after a day are priced on it too, which costs a few
 * rows and nothing else: the line counts a copy from the day it was added.
 */
async function heldNow() {
  const today = day(new Date());
  for (let back = 0; back < 8; back++) {
    const date = addDays(today, -back);
    if (dow(date) === 6) continue;
    const ids = await idsOn(date);
    if (ids.size) return { date, ids };
  }
  return { date: null, ids: new Set() };
}

async function recent() {
  const end = newestArchive();
  const english = await tcgplayerIds(Object.keys(JSON.parse(readFileSync(IDS, "utf8"))));
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

  const now = await heldNow();
  console.log(`  held now: ${now.ids.size} cards, as priced on ${now.date ?? "no recent night"}`);

  let written = 0;
  for (const date of dates) {
    const r = rate.get(date);
    const held = new Set([...(await idsOn(date)), ...now.ids]);
    // Saturday is the weekly series' day: every card gets a point. Any other day, the cards
    // that already had one, which is what the cron wrote, and the cards held now (heldNow).
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
  console.log(`${DRY ? "Would write" : "Wrote"} ${written} TCGplayer readings.`);
}

/**
 * Every day for every English card, from tcgcsv's first archive to its newest.
 *
 * Bart, 2026-09-13: a price for every card every day, back as far as there is one. tcgcsv starts
 * on 2024-02-08, and that is as far back as TCGplayer's figures go for a whole shelf, and as far
 * back as the archive goes. Stored a month to a row (card_price_months), which is
 * what makes this fit: some twenty-five million day readings as seven hundred thousand month rows.
 * The Japanese shelf is paused and not filled.
 *
 * A month's days are gathered and written once, when the month is done, rather than a day at a
 * time. `--from` and `--to` narrow the days, to resume a run that stopped (resume on the first of
 * a month: a month is written whole). An archive tcgcsv does not have is skipped and said. Each
 * archive is deleted once read: two and a half years of them is almost four gigabytes.
 */
async function daily() {
  const english = await tcgplayerIds(Object.keys(JSON.parse(readFileSync(IDS, "utf8"))));
  // `--ids a,b`: only these cards, for cards linked after the run (tcgplayer-links.mjs).
  const only = flag("--ids")?.split(",").filter(Boolean);
  const ids = Object.keys(english)
    .filter((id) => english[id] && (!only || only.includes(id)))
    .slice(0, LIMIT);
  const from = flag("--from") ?? TCGCSV_FROM;
  const to = flag("--to") ?? newestArchive();
  const rate = await rates(from, to);
  /* One reading a week before the six months the archive keeps daily, as the price job thins
     them (weekly_price_days): a month sent day by day is merged in and never thinned again, so
     `--ids` for a card linked late would otherwise leave its old months daily for good. */
  const cutoff = weeklyBefore();
  const plan = japaneseDays(from, to, cutoff);
  console.log(
    `daily: ${ids.length} English cards, ${plan.length} days (weekly before ${cutoff}), ${from} to ${to}${DRY ? " (dry run: nothing is written)" : ""}`,
  );
  let written = 0;
  let month = [];
  const flush = async () => {
    await writeDays(month);
    written += month.length;
    month = [];
  };
  for (const { date: planned, fallbacks } of plan) {
    if (month.length && month[0].date.slice(0, 7) !== planned.slice(0, 7)) await flush();
    let en = null;
    let date = planned;
    for (const d of [planned, ...fallbacks]) {
      try {
        en = tcgcsvDay(d, CATEGORY_EN);
        date = d;
        break;
      } catch (err) {
        console.log(
          `  ${d}: no archive (${err instanceof Error ? err.message.split("\n")[0] : err})`,
        );
      }
    }
    if (!en) continue;
    const r = rate.get(date);
    let priced = 0;
    for (const id of ids) {
      // Every printing TCGplayer prices, and the Shadowless run's where tcgplayer-links.mjs linked
      // the card to that group, under the run it is.
      const sources = [[english[id].productId, printingKey]];
      if (english[id].shadowless) {
        sources.push([english[id].shadowless.productId, (s) => shadowlessKey(printingKey(s))]);
      }
      let any = false;
      // The card's own product first; a run's printing of the same name is dropped, as the cron
      // does (snapshot.ts cardPricesFromShelf): Machamp's Deck Exclusives 1st Edition, not its
      // Shadowless group's.
      const seen = new Set();
      for (const [productId, name] of sources) {
        for (const [subType, usd] of en.get(productId) ?? []) {
          const euros = cents(usd, r);
          if (euros == null || seen.has(name(subType))) continue;
          seen.add(name(subType));
          month.push({
            tcgId: id,
            printing: name(subType),
            date,
            price: euros / 100,
            source: "tcgplayer",
          });
          any = true;
        }
      }
      if (any) priced++;
    }
    // A daily archive is read once; a weekly one is kept, the other modes read the same Saturdays.
    if (date >= cutoff) rmSync(join(CACHE, `prices-${date}.ppmd.7z`), { force: true });
    console.log(`  ${date}: ${priced} of ${ids.length} cards priced`);
  }
  if (month.length) await flush();
  console.log(`${DRY ? "Would write" : "Wrote"} ${written} printing readings.`);
}

// ── Japanese: the shelf's history, per printing ──────────────────────────────

/** The first of the month six months back: before it the archive keeps one reading a week. */
const weeklyBefore = () => {
  const now = new Date();
  return day(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)));
};

/**
 * The days a Japanese history reads: every day from `weeklyBefore()`, and before it one day a
 * week, the Saturday, as the archive keeps those months (thin_oldest_price_month,
 * weekly_price_days). A week whose Saturday falls in the next month belongs to that month's row,
 * as the SQL has it, so a month's last days after its last Saturday are read on the next month's
 * first Saturday. `fallbacks` are the earlier days of the same week and month, tried when tcgcsv
 * has no archive for the Saturday.
 */
function japaneseDays(from, to, cutoff) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d >= cutoff) {
      out.push({ date: d, fallbacks: [] });
      continue;
    }
    if (dow(d) !== 6) continue;
    const fallbacks = [];
    for (let back = 1; back <= 6; back++) {
      const earlier = addDays(d, -back);
      if (earlier < from || earlier.slice(0, 7) !== d.slice(0, 7)) break;
      fallbacks.push(earlier);
    }
    out.push({ date: d, fallbacks });
  }
  return out;
}

/**
 * Every printing TCGplayer prices on the Japanese shelf, from tcgcsv's archive (category 85: files
 * from 2024-08-24, but empty until mid-December 2024, the first full day 2024-12-14), under
 * TCGdex's Japanese id, the way the price job writes it each night since
 * 2026-09-14. It wrote the two old series once a week up to 2026-08-15 until then; those rows
 * were gone by 2026-09-14. `--to` defaults to the day before today, the price job's first night.
 */
/**
 * Every Japanese card the catalogue copy matched to a TCGplayer product (tcgplayer-japan.ts): the
 * sets TCGdex lists without cards, and cards the committed map does not name.
 */
async function copiedJapaneseProducts() {
  const out = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("catalogue_cards")
      .select("id, tcgplayer_product_id")
      .eq("language", "ja")
      .not("tcgplayer_product_id", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Reading the copy's Japanese products failed: ${error.message}`);
    for (const r of data) out[r.id] = r.tcgplayer_product_id;
    if (data.length < 1000) return out;
  }
}

async function japanese() {
  const mapped = await japaneseIds();
  const copied = await copiedJapaneseProducts();
  // `--copied-only`: just the cards the committed map does not name, whose history starts empty.
  const products = args.includes("--copied-only")
    ? Object.fromEntries(Object.entries(copied).filter(([id]) => mapped[id] == null))
    : { ...copied, ...Object.fromEntries(Object.entries(mapped).filter(([, p]) => p != null)) };
  // An id that is an English card is the English card's history (neo4-100 to 113 are both).
  const english = JSON.parse(readFileSync(IDS, "utf8"));
  for (const id of Object.keys(products)) if (english[id] !== undefined) delete products[id];
  const ids = Object.keys(products)
    .filter((id) => products[id] != null)
    .slice(0, LIMIT);
  const from = flag("--from") ?? JAPAN_FROM;
  const to = flag("--to") ?? addDays(day(new Date()), -1);
  const cutoff = weeklyBefore();
  const plan = japaneseDays(from, to, cutoff);
  const rate = await rates(from, to);
  console.log(
    `japanese: ${ids.length} cards, ${plan.length} days (weekly before ${cutoff}), ${from} to ${to}${DRY ? " (dry run: nothing is written)" : ""}`,
  );
  let written = 0;
  let month = [];
  const flush = async () => {
    await writeDays(month);
    written += month.length;
    month = [];
  };
  for (const { date, fallbacks } of plan) {
    if (month.length && month[0].date.slice(0, 7) !== date.slice(0, 7)) await flush();
    let read = null;
    let used = null;
    for (const d of [date, ...fallbacks]) {
      try {
        const day = tcgcsvDay(d, CATEGORY_JA);
        // An archive whose Japanese files are empty is no reading either: tcgcsv wrote empty ones
        // for most days until mid-December 2024 and for some after (2024-12-21, 2025-01-04).
        if (!day.size) continue;
        read = day;
        used = d;
        break;
      } catch {
        // No archive that day: the week's day before it.
      }
    }
    if (!read) {
      console.log(`  ${date}: no archive for the week`);
      continue;
    }
    const r = rate.get(used);
    let priced = 0;
    for (const id of ids) {
      let any = false;
      for (const [subType, usd] of read.get(products[id]) ?? []) {
        const euros = cents(usd, r);
        if (euros == null) continue;
        month.push({
          tcgId: id,
          printing: printingKey(subType),
          date: used,
          price: euros / 100,
          source: "tcgplayer",
        });
        any = true;
      }
      if (any) priced++;
    }
    console.log(`  ${used}: ${priced} of ${ids.length} cards priced`);
  }
  if (month.length) await flush();
  console.log(`${DRY ? "Would write" : "Wrote"} ${written} printing readings.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (ONLY === "daily") {
  await daily();
  process.exit(0);
}

if (ONLY === "recent") {
  await recent();
  process.exit(0);
}

if (ONLY === "japanese") {
  await japanese();
  process.exit(0);
}

const ids = (await pricedIds()).slice(0, LIMIT);
console.log(`${ids.length} cards${DRY ? " (dry run: nothing is written)" : ""}`);
const products = await tcgplayerIds(ids);
const withProduct = ids.filter((id) => products[id]);
console.log(`${withProduct.length} of them have a TCGplayer product`);
const rate = await rates(TCGCSV_FROM, addDays(CRON_FROM, -1));

let written = 0;

{
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

console.log(`${DRY ? "Would write" : "Wrote"} ${written} readings.`);
