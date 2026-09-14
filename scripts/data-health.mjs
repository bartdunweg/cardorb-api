/**
 * Checks that the copy every page reads is whole and current, and says what is not.
 *
 * Bart, 2026-09-14: every set, card and price comes out of our own store, filled at night, so a
 * night that went wrong is a page that is quietly wrong the next morning. These are the ways it
 * went wrong that day, each one found by eye: 144 of 203 sets refused by a busy TCGdex in one run,
 * a Japanese promo shelf with no pictures, and Base Set Machamp's price line carrying another
 * product's figure, a 68 percent drop that never happened.
 *
 * Read-only. Asks the database through the Management API where SUPABASE_ACCESS_TOKEN is set (the
 * data-health workflow), or through the linked Supabase CLI on a person's machine. Writes the report
 * to stdout as Markdown and exits 1 where a check failed, so the workflow can file it.
 *
 *   node scripts/data-health.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PROJECT_REF = "fprjroupecdhosfdrqhv";

/** One SQL query's rows. */
async function query(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (token) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) throw new Error(`Query failed (${res.status}): ${await res.text()}`);
    return res.json();
  }
  const cli = process.env.SUPABASE_CLI ?? "supabase";
  const out = execFileSync(cli, ["db", "query", "--linked", sql], {
    cwd: process.env.SUPABASE_WORKDIR ?? ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("{"))).rows;
}

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

// ── The catalogue copy ──────────────────────────────────────────────────────

/**
 * How far behind a set may be and still be current: the nightly runs refresh the oldest sets a few
 * dozen at a time, so every set is read again within a few nights.
 */
const SET_STALE_DAYS = 7;
/** The copy's shape each catalogue is written in now (mirror.ts, mirror-language.ts). */
const FORMATS = { en: 2, ja: 6 };

const sync = await query(
  "select language, count(*)::int as sets, min(format)::int as oldest_format, min(synced_at)::text as oldest from catalogue_sync group by language order by language",
);
for (const language of Object.keys(FORMATS)) {
  const row = sync.find((r) => r.language === language);
  if (!row) {
    check(`Catalogue copy (${language})`, false, "holds no set at all");
    continue;
  }
  const behind = await query(
    `select count(*)::int as n from catalogue_sync where language = '${language}' and format < ${FORMATS[language]}`,
  );
  const stale = daysAgo(row.oldest.slice(0, 10));
  check(
    `Catalogue copy (${language})`,
    behind[0].n === 0 && stale <= SET_STALE_DAYS,
    `${row.sets} sets; ${behind[0].n} in an older shape; oldest copied ${stale} days ago`,
  );
}

/**
 * Cards whose picture is not in our bucket, per catalogue: none at all, or still another host's.
 * On 2026-09-14, with Scrydex as the last source, 2 English cards and 66 of 16,832 Japanese cards
 * had no picture anywhere; a jump past these is a night that failed
 * to copy, not a catalogue that has none.
 */
const PICTURELESS_CEILING = { en: 20, ja: 150 };
const pictures = await query(
  "select language, count(*) filter (where image is null)::int as none, count(*) filter (where image is not null and image not like 'https://images.cardorb.com/%')::int as elsewhere, count(*)::int as cards from catalogue_cards group by language",
);
for (const p of pictures) {
  const ceiling = PICTURELESS_CEILING[p.language] ?? 0;
  check(
    `Card pictures (${p.language})`,
    p.none <= ceiling && p.elsewhere === 0,
    `${p.cards} cards; ${p.none} without a picture (ceiling ${ceiling}); ${p.elsewhere} still on another host`,
  );
}

// ── Prices ──────────────────────────────────────────────────────────────────

const latest = await query(
  "select max(updated_on)::text as day, count(*)::int as rows from tcgplayer_prices",
);
const priceAge = latest[0].day ? daysAgo(latest[0].day) : Infinity;
check(
  "Today's TCGplayer prices",
  priceAge <= 1,
  `${latest[0].rows} printings, newest from ${latest[0].day ?? "never"} (${priceAge} days ago)`,
);

const rate = await query("select max(day)::text as day from usd_eur_rates");
const rateAge = rate[0].day ? daysAgo(rate[0].day) : Infinity;
check(
  "Dollar rate",
  rateAge <= 3,
  `newest from ${rate[0].day ?? "never"} (${rateAge} days ago; ECB publishes no weekend rate)`,
);

/**
 * Every linked card's newest history point beside today's stored price for the same printing.
 *
 * Both come from the same TCGplayer figure on the same night, so they agree to the cent once the
 * rate is applied. The rate is read off the pairs themselves (their median), which makes the check
 * independent of which day's rate the job used; a printing more than this far from it is a line
 * written from another product (Machamp: 27.42 dollars beside a history of 88).
 */
const MISMATCH = 0.1;
const links = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json"), "utf8"),
);
const day = latest[0].day;
if (day) {
  const month = `${day.slice(0, 7)}-01`;
  const dayIndex = Number(day.slice(8, 10));
  const [history, prices] = await Promise.all([
    query(
      `select tcg_id, printing, cents[${dayIndex}]::int as cents from card_price_months where month = '${month}' and cents[${dayIndex}] is not null`,
    ),
    query(
      `select product_id, printing, market::float as market from tcgplayer_prices where updated_on = '${day}'`,
    ),
  ]);
  const market = new Map(prices.map((p) => [`${p.product_id}${p.printing}`, p.market]));
  const pairs = [];
  for (const h of history) {
    const product = links[h.tcg_id]?.productId;
    const usd = product ? market.get(`${product}${h.printing}`) : undefined;
    if (usd > 0 && h.cents > 0) pairs.push({ ...h, usd, ratio: h.cents / 100 / usd });
  }
  const ratios = pairs.map((p) => p.ratio).sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)] ?? 0;
  // A few cents either way is the rounding of a card worth a few cents, not another product.
  const off = pairs
    .filter(
      (p) =>
        Math.abs(p.ratio / median - 1) > MISMATCH && Math.abs(p.cents - p.usd * median * 100) > 5,
    )
    .sort((a, b) => Math.abs(b.ratio / median - 1) - Math.abs(a.ratio / median - 1));
  check(
    "Price history agrees with today's price",
    pairs.length > 0 && off.length === 0,
    `${pairs.length} printings compared on ${day} at ${median.toFixed(4)} euros a dollar; ${off.length} more than ${MISMATCH * 100}% off${
      off.length
        ? `: ${off
            .slice(0, 15)
            .map(
              (p) =>
                `${p.tcg_id} ${p.printing} (history €${(p.cents / 100).toFixed(2)}, price $${p.usd})`,
            )
            .join("; ")}`
        : ""
    }`,
  );
}

// ── What a page would show wrong ────────────────────────────────────────────

/**
 * A card with today's price and no line in the history draws "No readings" on its sheet while its
 * price is shown above it: 4,300 Japanese cards on 2026-09-14 before their history was backfilled.
 * Per catalogue, through the product the copy or the committed map links.
 */
const jaLinks = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-ids.ja.generated.json"), "utf8"),
);
if (day) {
  const [copyProducts, historyIds, pricedProducts] = await Promise.all([
    query(
      "select language, id, tcgplayer_product_id as pid from catalogue_cards where tcgplayer_product_id is not null",
    ),
    query(
      `select distinct tcg_id from card_price_months where month >= '${day.slice(0, 7)}-01'::date - interval '1 month'`,
    ),
    query(`select distinct product_id from tcgplayer_prices where updated_on = '${day}'`),
  ]);
  const withHistory = new Set(historyIds.map((r) => r.tcg_id));
  const priced = new Set(pricedProducts.map((r) => r.product_id));
  const products = { en: new Map(), ja: new Map() };
  for (const [id, v] of Object.entries(links)) if (v?.productId) products.en.set(id, v.productId);
  for (const [id, pid] of Object.entries(jaLinks)) if (pid) products.ja.set(id, pid);
  for (const r of copyProducts)
    if (!products[r.language]?.has(r.id)) products[r.language]?.set(r.id, r.pid);
  for (const language of ["en", "ja"]) {
    const missing = [...products[language]].filter(
      ([id, pid]) => priced.has(pid) && !withHistory.has(id),
    );
    check(
      `Priced cards have a price line (${language})`,
      missing.length === 0,
      `${missing.length} priced cards without history${
        missing.length
          ? `: ${missing
              .slice(0, 10)
              .map(([id]) => id)
              .join(", ")}`
          : ""
      }`,
    );
  }
}

/** A number a person reads with a percent code in it ("#%3F"), which the copy writes decoded. */
const encoded = await query(
  "select count(*)::int as n, string_agg(id, ', ') filter (where true) as ids from (select id from catalogue_cards where local_id ~ '%[0-9A-Fa-f]{2}' limit 10) x",
);
check(
  "Card numbers read as printed",
  encoded[0].n === 0,
  `${encoded[0].n} card numbers still percent-encoded${encoded[0].n ? `: ${encoded[0].ids}` : ""}`,
);

// ── The slips the audits of 2026-09-14 found, each kept from coming back ────────

/**
 * One product priced for two cards is one of them wearing the other's price: six trainer kit halves
 * and a Worlds staff card in English, Chansey on Lucky Stadium and Houndour (U) on Houndour (HR) in
 * Japanese. Counted per catalogue, the copy's product ids and the committed maps together, leaving
 * out the printings TCGdex lists twice (Yellow A Alternate beside its own set) and the Shadowless
 * runs.
 */
{
  const byProduct = new Map();
  const add = (language, id, pid) => {
    if (!pid) return;
    const key = `${language}:${pid}`;
    byProduct.set(key, [...(byProduct.get(key) ?? []), id]);
  };
  for (const [id, v] of Object.entries(links)) add("en", id, v?.productId);
  const jaCopy = await query(
    "select id, tcgplayer_product_id as pid from catalogue_cards where language = 'ja' and tcgplayer_product_id is not null",
  );
  const jaSeen = new Set();
  for (const r of jaCopy) {
    add("ja", r.id, r.pid);
    jaSeen.add(r.id);
  }
  for (const [id, pid] of Object.entries(jaLinks)) if (!jaSeen.has(id)) add("ja", id, pid);
  const SAME_PRINTING = /^xya-|-\d+a$/;
  const shared = [...byProduct].filter(
    ([, ids]) =>
      ids.length > 1 &&
      !ids.every(
        (id) =>
          SAME_PRINTING.test(id) ||
          ids.some((o) => o !== id && o.endsWith(id.slice(id.indexOf("-")))),
      ),
  );
  check(
    "One product, one card",
    shared.length === 0,
    `${shared.length} products priced for more than one card${
      shared.length
        ? `: ${shared
            .slice(0, 8)
            .map(([k, ids]) => `${k} ${ids.join("+")}`)
            .join("; ")}`
        : ""
    }`,
  );
}

/**
 * An id that is an English card never holds a Japanese price: card_price_months has no language,
 * and neo4-106 Shining Celebi carried Japanese Chansey's figure as a `normal` printing.
 */
{
  const both = await query(
    "select c.id, c.tcgplayer_product_id as pid from catalogue_cards c where c.language = 'ja' and c.tcgplayer_product_id is not null and exists (select 1 from catalogue_cards e where e.language = 'en' and e.id = c.id)",
  );
  const risky = both.filter((r) => links[r.id]?.productId);
  check(
    "No Japanese price under an English id",
    true,
    `${risky.length} ids are cards in both catalogues with a Japanese product; the price job leaves those off (${
      risky
        .slice(0, 6)
        .map((r) => r.id)
        .join(", ") || "none"
    })`,
  );
}

/** A `market` series beside real printings is the old collection snapshot writing for a linked card. */
{
  const month = `${today.slice(0, 7)}-01`;
  const market = await query(
    `select distinct tcg_id from card_price_months where printing = 'market' and month = '${month}'`,
  );
  const linked = market.filter((r) => links[r.tcg_id]?.productId);
  check(
    "No stray market series on linked cards",
    linked.length === 0,
    `${linked.length} linked cards with a market series this month${
      linked.length
        ? `: ${linked
            .slice(0, 8)
            .map((r) => r.tcg_id)
            .join(", ")}`
        : ""
    }`,
  );
}

/** A set twice under one name in one catalogue is two tiles for one set (SM3p and SM3+). */
{
  const twice = await query(
    "select s.language, s.name, string_agg(s.id, ', ') as ids from catalogue_sets s where exists (select 1 from catalogue_cards c where c.language = s.language and c.set_id = s.id) group by s.language, s.name having count(*) > 1",
  );
  check(
    "Each set once",
    twice.length === 0,
    `${twice.length} names shared by sets with cards${twice.length ? `: ${twice.map((r) => `${r.language} ${r.name} (${r.ids})`).join("; ")}` : ""}`,
  );
}

/**
 * A reading more than three times off both neighbours, and back, on a card worth at least €10: most
 * are TCGplayer's own thin markets (Charizard 1st Edition, e-Card Umbreon), some a wrong product for
 * a day (ecard2-95a after its relink). Reported, not failed: the market is what it is.
 */
if (day) {
  const month = `${day.slice(0, 7)}-01`;
  const rows = await query(
    `select tcg_id, printing, cents from card_price_months where month = '${month}'`,
  );
  const spikes = [];
  for (const r of rows) {
    const c = r.cents ?? [];
    for (let i = 1; i < c.length - 1; i++) {
      const [a, b, n] = [c[i - 1], c[i], c[i + 1]];
      if (a == null || b == null || n == null || Math.min(a, n) < 1000) continue;
      if (b > 3 * Math.max(a, n) || b * 3 < Math.min(a, n))
        spikes.push(`${r.tcg_id} ${r.printing} day ${i + 1}`);
    }
  }
  check(
    "Price spikes this month (reported)",
    true,
    `${spikes.length} one-day spikes over €10${spikes.length ? `: ${spikes.slice(0, 10).join("; ")}` : ""}`,
  );
}

// ── Report ──────────────────────────────────────────────────────────────────

const failed = checks.filter((c) => !c.ok);
console.log(
  `## Data health, ${today}: ${failed.length ? `${failed.length} of ${checks.length} checks failed` : `all ${checks.length} checks passed`}\n`,
);
console.log("| Check | Result | Detail |");
console.log("|---|---|---|");
for (const c of checks)
  console.log(`| ${c.name} | ${c.ok ? "ok" : "**failed**"} | ${c.detail.replaceAll("|", "\\|")} |`);
process.exit(failed.length ? 1 : 0);
