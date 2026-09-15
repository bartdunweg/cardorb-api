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
import {
  copyPriceOf,
  isPatternedReverse,
  isReverseFinish,
  printingKeysOf,
} from "../src/lib/core/price-basis.mjs";
import { runKey, runLinksOf } from "../src/lib/core/price-months.mjs";
import { THREE_DIGIT_SETS, canonNumber, correctedNumber } from "../src/lib/core/card-number.mjs";

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
// ja is CATALOGUE_FORMAT + LANGUAGE_FORMAT's own step: 5 + 7.
const FORMATS = { en: 5, ja: 12 };

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

// ── The copy's facts ────────────────────────────────────────────────────────

/**
 * The rarity words each catalogue may hold, one spelling each (rarity-words.json, which the tests
 * hold every correction to). "None" is not one: a card with no rarity holds none (2026-09-14, 39 English
 * cards and 1,670 Japanese ones held the word).
 */
const RARITY_WORDS = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "catalogue", "rarity-words.json"), "utf8"),
);
const rarities = await query(
  "select language, rarity, count(*)::int as n from catalogue_cards where rarity is not null group by language, rarity",
);
for (const language of Object.keys(RARITY_WORDS)) {
  const rows = rarities.filter((r) => r.language === language);
  const none = rows.filter((r) => r.rarity.trim().toLowerCase() === "none");
  check(
    `No "None" as a rarity (${language})`,
    none.length === 0,
    `${none.reduce((a, r) => a + r.n, 0)} cards hold the word`,
  );
  const allowed = new Set(RARITY_WORDS[language]);
  const other = rows.filter(
    (r) => !allowed.has(r.rarity) && r.rarity.trim().toLowerCase() !== "none",
  );
  check(
    `Rarity spellings (${language})`,
    other.length === 0,
    `${other.length} words outside the list${
      other.length ? `: ${other.map((r) => `${r.rarity} (${r.n})`).join(", ")}` : ""
    }`,
  );
}

/**
 * The promo sets, whose every card is a "Promo" (Bart, 2026-09-15): a promo prints a black star and
 * no rarity symbol. The same list as PROMO_SETS in src/lib/core/catalogue/promo-sets.ts, which this
 * plain script cannot import; promo-sets.test.ts holds the two lists to each other.
 */
const PROMO_SETS = [
  "basep",
  "np",
  "dpp",
  "hgssp",
  "bwp",
  "xyp",
  "smp",
  "swshp",
  "svp",
  "mep",
  "miscp",
  "wp",
  "M-P",
  "SV-P",
];
const promoList = PROMO_SETS.map((id) => `'${id}'`).join(", ");

/** Every card of a promo set in the copy says "Promo", whichever catalogue filled it. */
{
  const rows = await query(
    `select language, set_id, coalesce(rarity, 'no rarity') as rarity, count(*)::int as n from catalogue_cards where set_id in (${promoList}) and rarity is distinct from 'Promo' group by 1, 2, 3 order by 1, 2, 3`,
  );
  check(
    "Every promo set's cards are Promo",
    rows.length === 0,
    `${rows.reduce((n, r) => n + r.n, 0)} cards say otherwise${
      rows.length
        ? `: ${rows
            .slice(0, 8)
            .map((r) => `${r.language} ${r.set_id} ${r.rarity} (${r.n})`)
            .join(", ")}`
        : ""
    }`,
  );
}

/**
 * Every set the copy calls a promo set is in PROMO_SETS. A new one that is not would have its cards
 * keep TCGdex's word, or none, and nothing else would say so.
 */
{
  const sets = await query(
    "select language, id, name from catalogue_sets where name ~* 'promo' order by language, id",
  );
  const missing = sets.filter((r) => !PROMO_SETS.includes(r.id));
  check(
    "Every promo set is listed",
    missing.length === 0,
    `${sets.length} sets named promo; ${missing.length} not in PROMO_SETS${
      missing.length
        ? `: ${missing.map((r) => `${r.language} ${r.id} (${r.name})`).join(", ")}`
        : ""
    }`,
  );
}

/**
 * Cards with no illustrator, per catalogue. Some print none (an energy, a McDonald's card with no
 * credit), so this is a ceiling rather than zero: 719 English cards on 2026-09-14, and 562 Japanese
 * ones once Scrydex's artists are in (6,192 before). The Japanese count rose to 634 on 2026-09-15:
 * TCGdex answers an empty string for 448 artists it does not know, which kept Scrydex's out for 236
 * of them (mirror-language.ts reads the empty string as none since), and the 118 cards added that
 * day are mostly Energy, which print no artist.
 */
const ILLUSTRATORLESS_CEILING = { en: 740, ja: 600 };
const illustrators = await query(
  "select language, count(*) filter (where illustrator is null or illustrator = '')::int as none, count(*)::int as cards from catalogue_cards group by language",
);
for (const [language, ceiling] of Object.entries(ILLUSTRATORLESS_CEILING)) {
  const row = illustrators.find((r) => r.language === language);
  check(
    `Cards without an illustrator (${language})`,
    !!row && row.none <= ceiling,
    `${row?.none ?? 0} of ${row?.cards ?? 0} cards (ceiling ${ceiling})`,
  );
}

/**
 * A Japanese Stage 1 or Stage 2 Pokémon with no evolution: 2,985 on 2026-09-14, before Scrydex's
 * filled them (scrydex-cards.ja.generated.json); 80 are left that no source names.
 */
const JA_UNEVOLVED_CEILING = 100;
const unevolved = await query(
  "select count(*)::int as n, string_agg(id, ', ') filter (where true) as ids from (select id from catalogue_cards where language = 'ja' and stage in ('Stage1', 'Stage2', 'Stage 1', 'Stage 2') and (evolve_from is null or evolve_from = '') order by id) x",
);
check(
  "Japanese Stage 1 and 2 cards name their evolution",
  unevolved[0].n <= JA_UNEVOLVED_CEILING,
  `${unevolved[0].n} without one (ceiling ${JA_UNEVOLVED_CEILING})${
    unevolved[0].n > JA_UNEVOLVED_CEILING
      ? `: ${unevolved[0].ids.split(", ").slice(0, 10).join(", ")}`
      : ""
  }`,
);

/**
 * Every Japanese set holds the cards it prints: the count Scrydex lists for it with a printed number
 * (scripts/scrydex-japan-cards.mjs writes it). Shiny Treasure ex held 320 of 360 on 2026-09-14.
 */
const SCRYDEX_JA = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "scrydex-cards.ja.generated.json"), "utf8"),
);
{
  const held = await query(
    "select set_id, count(*)::int as n from catalogue_cards where language = 'ja' group by set_id",
  );
  const count = new Map(held.map((r) => [r.set_id, r.n]));
  const short = Object.entries(SCRYDEX_JA.sets)
    .map(([id, s]) => ({ id, expected: s.cards, held: count.get(id) ?? 0 }))
    .filter((s) => s.held < s.expected);
  check(
    "Japanese sets hold every card they print",
    short.length === 0,
    `${Object.keys(SCRYDEX_JA.sets).length} sets compared; ${short.length} short${
      short.length ? `: ${short.map((s) => `${s.id} ${s.held} of ${s.expected}`).join(", ")}` : ""
    }`,
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
      `select tcg_id, printing, cents[${dayIndex}]::int as cents from card_price_months where language = 'en' and month = '${month}' and cents[${dayIndex}] is not null`,
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
      `select distinct language, tcg_id from card_price_months where month >= '${day.slice(0, 7)}-01'::date - interval '1 month'`,
    ),
    query(`select distinct product_id from tcgplayer_prices where updated_on = '${day}'`),
  ]);
  const withHistory = new Set(historyIds.map((r) => `${r.language}|${r.tcg_id}`));
  const priced = new Set(pricedProducts.map((r) => r.product_id));
  const products = { en: new Map(), ja: new Map() };
  for (const [id, v] of Object.entries(links)) if (v?.productId) products.en.set(id, v.productId);
  for (const [id, pid] of Object.entries(jaLinks)) if (pid) products.ja.set(id, pid);
  for (const r of copyProducts)
    if (!products[r.language]?.has(r.id)) products[r.language]?.set(r.id, r.pid);
  for (const language of ["en", "ja"]) {
    const missing = [...products[language]].filter(
      ([id, pid]) => priced.has(pid) && !withHistory.has(`${language}|${id}`),
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

/**
 * The patterned reverses (Poké Ball, Master Ball, Friend, Love, Quick and Dusk Ball, Team Rocket,
 * Energy Symbol) are TCGplayer products of their own
 * (tcgplayer-patterns.generated.json finishPrints), priced under the card as
 * "poke-ball-reverse-holofoil" and so on. Every one TCGplayer priced today has a line for that
 * printing, and at the figure of its own product: a line missing or off is a Poké Ball copy whose
 * chart shows nothing, or another product's price.
 *
 * And no form offers a ball or Energy Symbol finish that is not one of those products: offers come
 * from that file wherever a card has a TCGplayer link (card-printings.ts printingsOf), so the one way
 * back is a card TCGdex names a ball foil on and no link, where TCGdex's word still stands.
 */
/** TCGdex's foil on a reverse, and the finish TCGplayer sells it as (card-printings.ts BALL_OF). */
const BALL_FOILS = {
  pokeball: "poke-ball",
  masterball: "master-ball",
  friendball: "friend-ball",
  loveball: "love-ball",
  quickball: "quick-ball",
  duskball: "dusk-ball",
  "team-rocket": "team-rocket",
};
const patterns = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-patterns.generated.json"), "utf8"),
);
if (day) {
  const month = `${day.slice(0, 7)}-01`;
  const dayIndex = Number(day.slice(8, 10));
  const prints = Object.entries(patterns).flatMap(([id, c]) =>
    (c.finishPrints ?? []).map((p) => ({ id, ...p, key: `${p.finish}-reverse-holofoil` })),
  );
  const [lines, prices, rateRow] = await Promise.all([
    query(
      `select tcg_id, printing, cents[${dayIndex}]::int as cents from card_price_months where language = 'en' and month = '${month}' and printing in (${[...new Set(prints.map((p) => `'${p.key}'`))].join(",") || "''"})`,
    ),
    query(
      `select product_id, printing, market::float as market from tcgplayer_prices where updated_on = '${day}' and product_id in (${prints.map((p) => p.productId).join(",") || "0"})`,
    ),
    query(
      `select rate::float as rate from usd_eur_rates where day <= '${day}' order by day desc limit 1`,
    ),
  ]);
  const line = new Map(lines.map((l) => [`${l.tcg_id}|${l.printing}`, l.cents]));
  const usdOf = new Map();
  for (const p of prices) usdOf.set(p.product_id, [...(usdOf.get(p.product_id) ?? []), p]);
  const euro = rateRow[0]?.rate ?? null;
  const priced = prints.filter((p) => usdOf.has(p.productId));
  const missing = priced.filter((p) => line.get(`${p.id}|${p.key}`) == null);
  const off = priced.filter((p) => {
    const cents = line.get(`${p.id}|${p.key}`);
    const rows = usdOf.get(p.productId) ?? [];
    const usd = (rows.find((r) => r.printing === p.printing) ?? rows[0])?.market;
    return (
      cents != null &&
      euro &&
      usd > 0 &&
      Math.abs(cents - usd * euro * 100) > Math.max(5, usd * euro * 100 * MISMATCH)
    );
  });
  check(
    "Patterned reverses (balls, Team Rocket, Energy Symbol) have their own price line",
    prints.length > 0 && missing.length === 0 && off.length === 0,
    `${prints.length} products, ${priced.length} priced on ${day}; ${missing.length} without a line that day, ${off.length} off their product's figure${
      missing.length + off.length
        ? `: ${[...missing, ...off]
            .slice(0, 10)
            .map((p) => `${p.id} ${p.key} (${p.productId})`)
            .join("; ")}`
        : ""
    }`,
  );
}
{
  const named = await query(
    `select id, v->>'foil' as foil from catalogue_cards, jsonb_array_elements(variants) v where language = 'en' and v->>'type' = 'reverse' and v->>'foil' in (${Object.keys(
      BALL_FOILS,
    )
      .map((f) => `'${f}'`)
      .join(",")})`,
  );
  const unlinked = named.filter((r) => !links[r.id]?.productId);
  const sold = new Set(
    Object.entries(patterns).flatMap(([id, c]) =>
      (c.finishPrints ?? []).map((p) => `${id}|${p.finish}`),
    ),
  );
  const dropped = named.filter(
    (r) => links[r.id]?.productId && !sold.has(`${r.id}|${BALL_FOILS[r.foil]}`),
  );
  const stored = await query(
    `select tcg_id, finish, count(*)::int as n from cards where finish in (${[
      ...Object.values(BALL_FOILS),
      "energy-symbol",
    ]
      .map((f) => `'${f}'`)
      .join(",")}) and tcg_id is not null group by 1, 2`,
  );
  const storedWithout = stored.filter((r) => !sold.has(`${r.tcg_id}|${r.finish}`));
  check(
    "Ball and Energy Symbol finishes offered only where TCGplayer sells them",
    unlinked.length === 0,
    `${unlinked.length} cards offer a TCGdex ball with no TCGplayer link to check it${
      unlinked.length
        ? ` (${unlinked
            .slice(0, 8)
            .map((r) => `${r.id} ${r.foil}`)
            .join(", ")})`
        : ""
    }; ${dropped.length} TCGdex balls not offered because TCGplayer sells none${
      dropped.length
        ? ` (${dropped
            .slice(0, 8)
            .map((r) => `${r.id} ${r.foil}`)
            .join(", ")})`
        : ""
    }; ${storedWithout.length} kinds of stored copy with such a finish on a card TCGplayer sells none of, unpriced${
      storedWithout.length
        ? ` (${storedWithout
            .slice(0, 8)
            .map((r) => `${r.tcg_id} ${r.finish}`)
            .join(", ")})`
        : ""
    }`,
  );
}

/**
 * Whether a plain reverse exists is decided per card from four witnesses (reverse-holo.generated.json,
 * scripts/reverse-holo-evidence.mjs): TCGdex, TCGplayer and Scrydex, and Bulbapedia's set rule where
 * they tie. Reported, not failed: the sets whose witnesses disagreed on the run that decided, and the
 * cards on which tonight's TCGdex variants or this week's TCGplayer printings now disagree with the
 * decision, per set. A card with a reverse figure tonight that the decision gives no reverse is a
 * decision to look at again; so is a linked card the run never saw. Stored reverse copies on a card
 * decided without one are counted.
 */
const reverseHolo = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "reverse-holo.generated.json"), "utf8"),
);
if (day) {
  const [variants, reversePrices, storedReverse] = await Promise.all([
    query(
      "select id, set_id, variants from catalogue_cards where language = 'en' and jsonb_array_length(coalesce(variants, '[]'::jsonb)) > 0",
    ),
    query(
      `select distinct product_id from tcgplayer_prices where updated_on = '${day}' and printing = 'reverse-holofoil'`,
    ),
    query(
      "select tcg_id, count(*)::int as n from cards where finish = 'reverse-holo' and tcg_id is not null and language is distinct from 'ja' group by 1",
    ),
  ]);
  const priced = new Set(reversePrices.map((r) => r.product_id));
  // The cards the run already found the witnesses split on are its table, not tonight's news.
  const disputed = new Set(
    Object.values(reverseHolo.sets).flatMap((v) => (v.disputed ?? []).map((d) => d.split(" ")[0])),
  );
  const drift = new Map();
  const note = (setId, id) => drift.set(setId, [...(drift.get(setId) ?? []), id]);
  let unseen = 0;
  for (const c of variants) {
    const decided = reverseHolo.cards[c.id];
    if (disputed.has(c.id)) continue;
    if (decided === undefined) {
      if (links[c.id]?.productId) unseen++;
      continue;
    }
    const energySold = (patterns[c.id]?.finishPrints ?? []).some(
      (p) => p.finish === "energy-symbol",
    );
    // A plain reverse names no foil, or the ex era's energy foil (reverse-holo-evidence.mjs).
    const tcgdex = c.variants.some((v) => {
      const foil = (v.foil ?? "").toLowerCase();
      return v.type === "reverse" && (foil === "" || (foil === "energy" && !energySold));
    });
    const productId = links[c.id]?.productId;
    const tcgplayer = productId ? priced.has(productId) : null;
    /* TCGdex silent on a card decided with a reverse is the gap the decision fills (whole Black &
       White and XY sets), so only a reverse it names against a "no" counts; TCGplayer counts either
       way where it prices the card tonight. */
    if ((tcgdex && !decided) || (tcgplayer === true && !decided)) note(c.set_id, c.id);
  }
  const bySet = [...drift].sort((x, y) => y[1].length - x[1].length);
  const disputedSets = Object.entries(reverseHolo.sets)
    .filter(([, v]) => v.disputed?.length)
    .sort((x, y) => y[1].disputed.length - x[1].disputed.length);
  const withdrawn = storedReverse.filter((r) => reverseHolo.cards[r.tcg_id] === false);
  check(
    "Reverse holo witnesses (reported)",
    true,
    `${Object.keys(reverseHolo.cards).length} cards decided, ${Object.values(reverseHolo.cards).filter(Boolean).length} with a plain reverse; witnesses disagreed on ${disputedSets.reduce((n, [, v]) => n + v.disputed.length, 0)} cards in ${disputedSets.length} sets (${disputedSets
      .slice(0, 8)
      .map(([id, v]) => `${id} ${v.disputed.length}`)
      .join(
        ", ",
      )}); tonight TCGdex or TCGplayer newly names a reverse the decision does not on ${[...drift.values()].reduce((n, ids) => n + ids.length, 0)} cards${
      bySet.length
        ? ` (${bySet
            .slice(0, 8)
            .map(([id, ids]) => `${id} ${ids.length}: ${ids.slice(0, 3).join(", ")}`)
            .join("; ")})`
        : ""
    }; ${unseen} linked cards the decision never saw; ${withdrawn.length} cards with a stored reverse copy decided without one${
      withdrawn.length
        ? ` (${withdrawn
            .slice(0, 6)
            .map((r) => r.tcg_id)
            .join(", ")})`
        : ""
    }`,
  );
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

/**
 * A number the copy holds another way than the card prints it, where the rule knows how it prints
 * (correctedNumber in card-number.mjs): Sword & Shield's 001 written 1, e-Card's H1 written H01. A set
 * copied before CATALOGUE_FORMAT 5 still holds TCGdex's spelling, so this is also the count of those
 * cards the nightly runs have yet to reach.
 */
{
  const sets = [...THREE_DIGIT_SETS, "ecard2", "ecard3", "bwp"];
  const cards = await query(
    `select id, local_id from catalogue_cards where language = 'en' and set_id in (${sets.map((id) => `'${id}'`).join(", ")})`,
  );
  const spelt = cards.filter((c) => correctedNumber(c.id, c.local_id) !== c.local_id);
  check(
    "Card numbers spelt as the cards print them",
    cards.length > 0 && spelt.length === 0,
    `${spelt.length} of ${cards.length} cards in the ${sets.length} sets with a printed spelling of their own still spelt TCGdex's way${
      spelt.length
        ? `: ${spelt
            .slice(0, 8)
            .map((c) => `${c.id} ${c.local_id}`)
            .join(", ")}`
        : ""
    }`,
  );
}

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
 * Every price line is a card of the catalogue it is filed under. The history's key is (language,
 * tcg_id, printing, month) since migration 20260915161000, because the catalogues share ids: neo4-106
 * Shining Celebi carried Japanese Chansey's figure while the key was the id alone. A line under a
 * language whose catalogue has no card by that id is a writer that named the wrong catalogue, or a
 * card the copy has since dropped (sm2+). Ids of both catalogues are counted beside it.
 */
{
  const [stray, shared] = await Promise.all([
    query(
      `with ids as (select language, tcg_id, count(*)::int as months from card_price_months group by 1, 2)
       select i.language, count(*)::int as ids, sum(i.months)::int as months,
         (array_agg(i.tcg_id order by i.tcg_id))[1:8] as examples
       from ids i
       where not exists (select 1 from catalogue_cards k where k.language = i.language and k.id = i.tcg_id)
       group by 1 order by 1`,
    ),
    query(
      "select count(distinct m.tcg_id)::int as ids from card_price_months m where m.language = 'ja' and exists (select 1 from catalogue_cards e where e.language = 'en' and e.id = m.tcg_id)",
    ),
  ]);
  check(
    "Price lines are cards of their own catalogue",
    stray.length === 0,
    `${stray.reduce((n, r) => n + r.ids, 0)} cards with a line under a catalogue that has no card by that id${
      stray.length
        ? `: ${stray.map((r) => `${r.language} ${r.ids} cards, ${r.months} months (${(r.examples ?? []).join(", ")})`).join("; ")}`
        : ""
    }; ${shared[0]?.ids ?? 0} Japanese lines on an id English also has, each its own line`,
  );
}

/** A `market` series beside real printings is the old collection snapshot writing for a linked card. */
{
  const month = `${today.slice(0, 7)}-01`;
  const market = await query(
    `select distinct tcg_id from card_price_months where language = 'en' and printing = 'market' and month = '${month}'`,
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
    `select language, tcg_id, printing, cents from card_price_months where month = '${month}'`,
  );
  const spikes = [];
  for (const r of rows) {
    const c = r.cents ?? [];
    for (let i = 1; i < c.length - 1; i++) {
      const [a, b, n] = [c[i - 1], c[i], c[i + 1]];
      if (a == null || b == null || n == null || Math.min(a, n) < 1000) continue;
      if (b > 3 * Math.max(a, n) || b * 3 < Math.min(a, n))
        spikes.push(`${r.language} ${r.tcg_id} ${r.printing} day ${i + 1}`);
    }
  }
  check(
    "Price spikes this month (reported)",
    true,
    `${spikes.length} one-day spikes over €10${spikes.length ? `: ${spikes.slice(0, 10).join("; ")}` : ""}`,
  );
}

/**
 * A held card with a reading the day before and the day after and none on the day itself, in any
 * of its printings: tcgcsv publishes every product every day, so a hole like that is a night the
 * history was not written, never the market. On 2026-09-13 the old collection snapshot wrote 184
 * held promos and gallery cards only a `market` series, the every-card pass left held cards to it,
 * and #444 deleted that series: Kanto's line on Home fell EUR 3,550 for the day. A binder's line
 * carries a card's last reading over a hole since then; this says the hole is there. The legacy
 * `market` and `holo` series do not count, as they did not fill that day's printings. The last 45
 * days, every account's held cards.
 */
{
  const holes = await query(
    `with held as (
         select distinct case when language = 'ja' then 'ja' else 'en' end as language, tcg_id
         from cards where owned and coalesce(tcg_id, '') <> ''
       ),
       d as (
         select distinct m.language, m.tcg_id, (m.month + (i - 1))::date as day
         from card_price_months m join held h using (language, tcg_id) cross join generate_series(1, 31) i
         where m.month >= date_trunc('month', current_date - 45)::date
           and m.printing not in ('market', 'holo')
           and m.cents[i] is not null
           and i <= extract(day from (m.month + interval '1 month' - interval '1 day'))
       )
     select (a.day + 1)::text as missing, count(*)::int as cards,
       (array_agg(a.tcg_id order by a.tcg_id))[1:6] as examples
     from d a
     where a.day + 1 >= current_date - 45
       and not exists (select 1 from d x where x.language = a.language and x.tcg_id = a.tcg_id and x.day = a.day + 1)
       and exists (select 1 from d y where y.language = a.language and y.tcg_id = a.tcg_id and y.day = a.day + 2)
     group by 1 order by 1`,
  );
  check(
    "Held cards' price lines miss no day",
    holes.length === 0,
    `${holes.reduce((n, r) => n + r.cards, 0)} missing days between two readings in the last 45 days${
      holes.length
        ? `: ${holes.map((r) => `${r.missing} ${r.cards} cards (${(r.examples ?? []).join(", ")})`).join("; ")}`
        : ""
    }`,
  );
}

// ── The collection rows ─────────────────────────────────────────────────────

/**
 * The owner's rows, held against the copy (migration 20260915090000, 2026-09-14). The other
 * accounts in cards are not real collections: they are counted in the detail and never fail a
 * check, and nothing of theirs but a count is written into the report.
 */
const OWNER = "bartdunweg";
const ownerIs = `(c.user_id = (select id from profiles where username = '${OWNER}'))`;
/** The catalogue a row's card lives in: Japanese for a Japanese row, English for every other (cataloguesFor). */
const rowCatalogue = "(case when c.language = 'ja' then 'ja' else 'en' end)";

/**
 * Every row names its card by id. 1,368 of the owner's rows carried a pokemontcg.io id from before
 * TCGdex (sv3pt5-162 for sv03.5-162): the page still found the card by set and number, but the CSV
 * import recognises a held row by id, and a row with a stale one looks new. An id the copy does not
 * have in the row's own catalogue is the same slip, and so is a deleted set's (sm2+, SM1+ and the
 * other SM+ ids the Japanese copy dropped), and a Japanese row on an English id or the reverse.
 */
{
  const unknown = `coalesce(c.tcg_id, '') <> '' and not exists (select 1 from catalogue_cards k where k.id = c.tcg_id and k.language = ${rowCatalogue})`;
  const rows = await query(
    `select ${ownerIs} as owner,
       count(*) filter (where coalesce(c.tcg_id, '') = '')::int as no_id,
       count(*) filter (where ${unknown})::int as missing,
       count(*) filter (where ${unknown} and exists (select 1 from catalogue_cards k where k.id = c.tcg_id))::int as other_language,
       (array_agg(distinct c.tcg_id) filter (where ${unknown}))[1:8] as examples,
       count(*)::int as rows
     from cards c group by 1`,
  );
  const owner = rows.find((r) => r.owner) ?? { no_id: 0, missing: 0, other_language: 0, rows: 0 };
  const others = rows.filter((r) => !r.owner);
  const sum = (key) => others.reduce((n, r) => n + r[key], 0);
  check(
    "The owner's rows carry a catalogue id",
    owner.rows > 0 && owner.no_id === 0,
    `${owner.no_id} of ${owner.rows} rows without one; other accounts ${sum("no_id")} of ${sum("rows")}`,
  );
  check(
    "Collection rows on a card the copy has",
    owner.missing === 0,
    `${owner.missing} of the owner's rows on an id their catalogue does not have (${owner.other_language} of them a card in the other language's)${
      owner.missing ? `: ${(owner.examples ?? []).join(", ")}` : ""
    }; other accounts ${sum("missing")} (${sum("other_language")} in the other language's)`,
  );
}

/**
 * Every row on a card of a promo set says "Promo" (promo-sets.ts): createRow() and createRows()
 * write it, and migration 20260915250000 moved the rows its owners had named by hand.
 */
{
  const rows = await query(
    `select ${ownerIs} as owner, count(*)::int as n, (array_agg(distinct c.tcg_id))[1:8] as examples
     from cards c
     where c.tcg_id is not null
       and regexp_replace(c.tcg_id, '-[^-]*$', '') in (${promoList})
       and c.rarity is distinct from 'Promo'
     group by 1`,
  );
  const owner = rows.find((r) => r.owner) ?? { n: 0, examples: [] };
  const others = rows.filter((r) => !r.owner).reduce((n, r) => n + r.n, 0);
  check(
    "The owner's promo rows are Promo",
    owner.n === 0,
    `${owner.n} rows say otherwise${
      owner.n ? `: ${(owner.examples ?? []).join(", ")}` : ""
    }; other accounts ${others}`,
  );
}

/**
 * Every row's number is its card's, whichever way either is spelt. The copy writes a number as the
 * card prints it (001) and a row keeps what was typed (1, or 020 for the promo SWSH020); the collection,
 * the copy sheet and the import all compare the two folded (canonNumber in card-number.mjs), so a
 * spelling alone never loses a row its card. A row whose number folds to another number than its
 * card's does: the sheet opened on the card lists no copies, and the set page says it is not held.
 * The rows spelt another way and found by the fold are counted beside it, for the record.
 */
{
  const rows = await query(
    `select ${ownerIs} as owner, c.tcg_id, c.number, k.local_id
       from cards c join catalogue_cards k on k.id = c.tcg_id and k.language = ${rowCatalogue}`,
  );
  const lost = rows.filter((r) => canonNumber(r.number) !== canonNumber(r.local_id));
  const folded = rows.filter(
    (r) => r.owner && r.number !== r.local_id && canonNumber(r.number) === canonNumber(r.local_id),
  );
  const owner = lost.filter((r) => r.owner);
  check(
    "Every copy's number finds its card",
    owner.length === 0,
    `${owner.length} of the owner's ${rows.filter((r) => r.owner).length} rows carry a number that is not their card's${
      owner.length
        ? `: ${owner
            .slice(0, 8)
            .map((r) => `${r.tcg_id} as ${r.number}`)
            .join(", ")}`
        : ""
    }; ${folded.length} spelt another way and found by the fold; other accounts ${lost.length - owner.length}`,
  );
}

/**
 * A copy recorded in a printing its card was never printed in: neither TCGdex's variants nor
 * TCGplayer's product (tcgplayer-ids.generated.json) names that finish, and at least one of them
 * answers. Fourteen of the owner's tag team and V promos were "normal" where both say holo only.
 * Only the plain finishes, and read leniently (any reverse variant counts, whatever its foil), so
 * this cannot disagree with what card-printings.ts offers on top: the ball and Energy Symbol
 * finishes have their own check above. A reverse holo copy is held against the evidence run's decision
 * where there is one (reverse-holo.generated.json), as card-printings.ts offers it.
 */
{
  const rows = await query(
    `select ${ownerIs} as owner, c.tcg_id, c.finish, k.variants
       from cards c join catalogue_cards k on k.language = 'en' and k.id = c.tcg_id
      where c.language is distinct from 'ja' and c.finish in ('normal', 'holo', 'reverse-holo')`,
  );
  const TCGDEX_TYPE = { normal: "normal", holo: "holo", "reverse-holo": "reverse" };
  const TCGPLAYER_NAMES = {
    normal: (v) => v === "normal" || v === "1st-edition" || v === "unlimited",
    holo: (v) => v.endsWith("holofoil") && !v.startsWith("reverse"),
    "reverse-holo": (v) => v === "reverse-holofoil",
  };
  const wrong = rows.filter((r) => {
    // A plain reverse exists where the evidence run decided so (reverse-holo.generated.json).
    const decided = r.finish === "reverse-holo" ? reverseHolo.cards[r.tcg_id] : undefined;
    if (decided !== undefined) return !decided;
    const variants = Array.isArray(r.variants) ? r.variants : [];
    const sold = links[r.tcg_id]?.variants ?? [];
    const tcgdex = variants.length ? variants.some((v) => v.type === TCGDEX_TYPE[r.finish]) : null;
    const tcgplayer = sold.length ? sold.some(TCGPLAYER_NAMES[r.finish]) : null;
    return (tcgdex !== null || tcgplayer !== null) && !tcgdex && !tcgplayer;
  });
  const owner = wrong.filter((r) => r.owner);
  check(
    "Copies in a printing their card has",
    owner.length === 0,
    `${owner.length} of the owner's copies in a finish neither TCGdex nor TCGplayer names for the card${
      owner.length
        ? `: ${owner
            .slice(0, 10)
            .map((r) => `${r.tcg_id} ${r.finish}`)
            .join(", ")}`
        : ""
    }; other accounts ${wrong.length - owner.length}`,
  );
}

/**
 * Every copy is priced as the printing it is, or not at all (Bart, 2026-09-14: a missing price shows
 * as unknown, never as another printing's). Tonight's TCGplayer figures for each linked card, read the
 * way copyPriceOf() reads them (price-basis.mjs), for every stored English copy.
 *
 * Fails where a reverse copy reads anything but its own reverse figure (the plain reverse's for a
 * reverse holo, its own product's for a Poké Ball or Energy Symbol one), or a normal or holo copy reads
 * the other of the two on a card TCGplayer prices both of. Reported only: a normal or holo copy on a
 * card TCGplayer sells as one printing under the other name (the Black Star promos TCGdex calls normal
 * and TCGplayer "Holofoil"), where the figure is the card's only one and the finish is the question.
 */
if (day) {
  const [rows, prices] = await Promise.all([
    query(
      `select ${ownerIs} as owner, c.tcg_id, c.finish, c.edition from cards c where c.owned and c.tcg_id is not null and c.language is distinct from 'ja' and c.finish is not null`,
    ),
    query(
      `select product_id, printing, market::float as market from tcgplayer_prices where updated_on = '${day}' and market is not null`,
    ),
  ]);
  const byProduct = new Map();
  for (const p of prices)
    byProduct.set(p.product_id, { ...byProduct.get(p.product_id), [p.printing]: p.market });
  const printingsOfCard = (id) => {
    const own = byProduct.get(links[id]?.productId);
    if (!own) return null;
    const out = { ...own };
    for (const fp of patterns[id]?.finishPrints ?? []) {
      const figure = byProduct.get(fp.productId)?.[fp.printing];
      if (figure != null) out[`${fp.finish}-reverse-holofoil`] = figure;
    }
    return out;
  };
  const PLAIN = new Set(["normal", "unlimited", "1st-edition", "shadowless", "blue-border"]);
  const HEADLINE = [
    "normal",
    "holofoil",
    "reverse-holofoil",
    "unlimited",
    "unlimited-holofoil",
    "1st-edition",
    "1st-edition-holofoil",
  ];
  const familyOf = (key) =>
    key.endsWith("reverse-holofoil")
      ? key
      : key.endsWith("holofoil")
        ? "holo"
        : PLAIN.has(key)
          ? "normal"
          : key;
  const ownFamily = (finish) =>
    finish === "reverse-holo"
      ? "reverse-holofoil"
      : isPatternedReverse(finish)
        ? `${finish}-reverse-holofoil`
        : finish;
  const wrong = [];
  const oneName = [];
  let compared = 0;
  for (const r of rows) {
    const printings = printingsOfCard(r.tcg_id);
    if (!printings) continue;
    compared++;
    const pricePrintings = Object.fromEntries(
      Object.entries(printings).map(([k, v]) => [k, { market: v }]),
    );
    // The card's own figure is TCGplayer's first printing in usdOf()'s order (tcgdex-client.ts).
    const headline = HEADLINE.find((k) => pricePrintings[k]);
    const card = { price: headline ? pricePrintings[headline] : null, pricePrintings };
    const price = copyPriceOf(r, card);
    if (!price) continue;
    const key =
      Object.keys(pricePrintings).find(
        (k) => pricePrintings[k] === price && printingKeysOf(r).includes(k),
      ) ?? headline;
    const own = ownFamily(r.finish);
    if (familyOf(key) === own) continue;
    const families = new Set(Object.keys(printings).map(familyOf));
    const slip = { ...r, key };
    if (isReverseFinish(r.finish) || families.has(own)) wrong.push(slip);
    else oneName.push(slip);
  }
  const list = (slips) =>
    slips.length
      ? ` (${slips
          .slice(0, 8)
          .map((w) => `${w.tcg_id} ${w.finish} as ${w.key}`)
          .join(", ")})`
      : "";
  const ownerWrong = wrong.filter((w) => w.owner);
  check(
    "Copies priced as their own printing",
    ownerWrong.length === 0,
    `${compared} priced copies compared on ${day}; ${ownerWrong.length} of the owner's priced as another printing${list(ownerWrong)}; other accounts ${wrong.length - ownerWrong.length}; reported: ${oneName.length} normal or holo copies on a card TCGplayer sells as one printing under the other name${list(oneName.filter((w) => w.owner))}`,
  );
}

// ── The Home chart ──────────────────────────────────────────────────────────

/**
 * The night's value point counts what /v1/stats counts (Bart, 2026-09-14). Every account's latest
 * point holds priced + unpriced = cards: until then the cron counted `priced` and `unpriced` in
 * different cards and `cards` in copies, and the owner's point read 1,928 copies, 1,611 priced and
 * 0 unpriced. And the owner's `unpriced` is the copies held that night with no figure for their own
 * printing, counted here from the stored TCGplayer prices the way copyPriceOf() reads them
 * (collection.ts storedPricesFor: the last seven days, a card with no headline figure unpriced
 * whole). The prices are the same at 07:30 as at the cron's 04:00: the price job writes at 21:15.
 * Held means owned and added by the point's day; a copy deleted since is not in the table any more.
 */
{
  const points = await query(
    `select distinct on (s.user_id) s.user_id = (select id from profiles where username = '${OWNER}') as owner, s.snapshot_date::text as day, s.cards, s.priced, s.unpriced from collection_value_snapshots s order by s.user_id, s.snapshot_date desc`,
  );
  const mine = points.find((p) => p.owner);
  const off = points.filter((p) => p.priced + p.unpriced !== p.cards);
  check(
    "Value points add up",
    off.length === 0,
    `latest point per account: priced + unpriced = cards on ${points.length - off.length} of ${points.length}${
      mine
        ? `; the owner's on ${mine.day}: ${mine.cards} cards, ${mine.priced} priced, ${mine.unpriced} unpriced`
        : ""
    }${off.some((p) => !p.owner) ? `; other accounts off ${off.filter((p) => !p.owner).length}` : ""}`,
  );

  if (mine) {
    const since = new Date(Date.parse(mine.day) - 7 * 86_400_000).toISOString().slice(0, 10);
    const [copies, stored] = await Promise.all([
      query(
        `select c.tcg_id, c.finish, c.edition, c.language, c.quantity::int as quantity from cards c where c.owned and ${ownerIs} and (c.acquired_at is null or c.acquired_at::date <= '${mine.day}')`,
      ),
      query(
        `select product_id, printing, market::float as market from tcgplayer_prices where updated_on >= '${since}' and market is not null`,
      ),
    ]);
    const byProduct = new Map();
    for (const p of stored)
      byProduct.set(p.product_id, { ...byProduct.get(p.product_id), [p.printing]: p.market });
    const HEADLINE = [
      "normal",
      "holofoil",
      "reverse-holofoil",
      "unlimited",
      "unlimited-holofoil",
      "1st-edition",
      "1st-edition-holofoil",
    ];
    /** The card as the collection prices it, or null where it carries no price at all. */
    const cardOf = (id) => {
      const link = links[id];
      const own = link ? byProduct.get(link.productId) : undefined;
      const headline = own && HEADLINE.find((k) => own[k] != null);
      if (!headline) return null;
      const printings = { ...own };
      for (const run of runLinksOf(link))
        for (const [k, v] of Object.entries(byProduct.get(run.productId) ?? {}))
          printings[runKey(run.edition, k)] ??= v;
      for (const fp of patterns[id]?.finishPrints ?? []) {
        const figure = byProduct.get(fp.productId)?.[fp.printing];
        if (figure != null) printings[`${fp.finish}-reverse-holofoil`] = figure;
      }
      const pricePrintings = Object.fromEntries(
        Object.entries(printings).map(([k, v]) => [k, { market: v }]),
      );
      return { price: pricePrintings[headline], pricePrintings };
    };
    let held = 0;
    let unpriced = 0;
    /** Copies this count cannot price the way the collection does: Japanese, or with no TCGplayer link. */
    let outside = 0;
    for (const r of copies) {
      const n = Math.max(0, r.quantity ?? 0);
      held += n;
      if (r.language === "ja" || !r.tcg_id || !links[r.tcg_id]) {
        outside += n;
        continue;
      }
      const card = cardOf(r.tcg_id);
      if (!card || copyPriceOf(r, card)?.market == null) unpriced += n;
    }
    check(
      "The owner's value point counts the unpriced copies",
      outside === 0
        ? mine.unpriced === unpriced
        : mine.unpriced >= unpriced && mine.unpriced <= unpriced + outside,
      `point on ${mine.day}: ${mine.unpriced} unpriced of ${mine.cards}; held now by that day ${held} copies, ${unpriced} without a figure for their own printing${
        outside ? ` and ${outside} this count cannot price (Japanese or unlinked)` : ""
      }`,
    );
  }
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
