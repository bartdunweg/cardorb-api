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
  priceFromUsd,
  printingKeysOf,
  shelfFigureOf,
} from "../src/lib/core/price-basis.mjs";
import {
  JUMP_FLOOR_CENTS,
  JUMP_RATIO,
  daysFromMonths,
  daysOfMonthRow,
  priceJumps,
  printingKey as printingName,
  runKey,
  runLinksOf,
} from "../src/lib/core/price-months.mjs";
import { THREE_DIGIT_SETS, canonNumber, correctedNumber } from "../src/lib/core/card-number.mjs";
import {
  numberDisagrees,
  printedNumberOfProduct,
  rarityOfProduct,
  cardTypeOfProduct,
  stageDisagrees,
  stageOfProduct,
  nameWithProductMark,
  tcgplayerRarity,
  typesDisagree,
} from "../src/lib/core/tcgplayer-rules.mjs";
import { strayRarityEntries } from "../src/lib/core/binder-rarity-words.mjs";
import { PRINT_RUN_NAMES, UNMAPPED_SUBTYPES, runsOfSubtypes } from "../src/lib/core/print-runs.mjs";
import { NEVER_FILLS, SAYS_MORE } from "../src/lib/core/japanese-rarity-rules.mjs";
import {
  disjointFinishesBySet,
  undecidedLinkedCards,
} from "../src/lib/core/reverse-holo-rules.mjs";
import { paddingReport, paddingWitness } from "../src/lib/core/number-padding.mjs";
import {
  fillsPokedexSlot,
  nameParts,
  normalise,
  normaliseLocal,
  speciesInKey,
  speciesIndex,
} from "../src/lib/core/species-match.mjs";
import {
  dayOf,
  groupsOfSets,
  scrydexExpansions,
  setFactsAgainst,
} from "../src/lib/core/set-facts-rules.mjs";
import { EXCEPTIONS, FIELDS, SOURCES } from "../src/lib/core/consensus.mjs";

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

/**
 * An English set with cards on the shelf and no logo. 30th Celebration came out on 2026-09-16 with
 * none from TCGdex and none in the hand-written Scrydex codes, and was seen by eye; the nightly copy
 * now finds a new set's Scrydex logo by its exact name on pokemontcg.io (scrydex-japan-logos.ts),
 * and a set listed here is one that rule did not reach. The sets below have no logo anywhere, as
 * looked for on 2026-09-19 (TCGdex, pokemontcg.io's host and list, Scrydex): they are listed in
 * the detail and do not fail the check.
 */
const NO_LOGO_ANYWHERE = {
  // Miscellaneous Promos: Scrydex answers its miscp code with the plain Pokémon TCG wordmark.
  miscp: "Miscellaneous Promos",
  // Yellow A Alternate: Scrydex's stand-in, and pokemontcg.io lists no such set.
  xya: "Yellow A Alternate",
};
const logoless = await query(
  `select s.id, s.name from catalogue_sets s
   where s.language = 'en' and s.logo is null and s.cards_recorded
     and exists (select 1 from catalogue_cards c where c.language = 'en' and c.set_id = s.id)
   order by s.id`,
);
const logolessUnknown = logoless.filter((r) => !(r.id in NO_LOGO_ANYWHERE));
check(
  "Every English set with cards has a logo",
  logolessUnknown.length === 0,
  `${logolessUnknown.length} sets${
    logolessUnknown.length ? `: ${logolessUnknown.map((r) => `${r.id} ${r.name}`).join(", ")}` : ""
  }; ${logoless.length - logolessUnknown.length} with no logo anywhere (${Object.keys(
    NO_LOGO_ANYWHERE,
  ).join(", ")})`,
);

/**
 * A picture copied from a Limitless folder whose code more than one English set prints. The folder
 * is one of those sets' cards, and a HEAD answers 200 for the other's number all the same: the 30
 * cards of 30th Classic Collection were copied from 30th Celebration's 30C folder, Charizard as
 * Exeggcute (2026-09-17). The copy no longer guesses in such a folder (sharedSetCodes in
 * artwork.ts), so a row here is one copied before that, or a guard that stopped holding.
 *
 * The folder is read from the address itself, not the card's set, so a card filed under another
 * set's code shows up too. A card opened and found right is listed with what it showed.
 */
const LIMITLESS_SHARED_CHECKED = {
  // Mew 025/025, Celebrations' own gold Mew, opened 2026-09-17.
  "cel25-25": "Mew",
};
const sharedLimitless = await query(
  `with codes as (
     select upper(split_part(abbreviation, ':', 1)) as code
     from catalogue_sets where language = 'en' and abbreviation is not null
     group by 1 having count(*) > 1
   )
   select c.id, c.name, split_part(c.image, '/', 6) as code
   from catalogue_cards c join codes on codes.code = upper(split_part(c.image, '/', 6))
   where c.language = 'en' and c.image like 'https://images.cardorb.com/limitless/tpci/%'
   order by c.id`,
);
const sharedUnchecked = sharedLimitless.filter((r) => !(r.id in LIMITLESS_SHARED_CHECKED));
check(
  "No pictures from a shared Limitless code (en)",
  sharedUnchecked.length === 0,
  `${sharedUnchecked.length} cards${
    sharedUnchecked.length
      ? `: ${sharedUnchecked
          .slice(0, 10)
          .map((r) => `${r.id} ${r.name} (${r.code})`)
          .join(", ")}${sharedUnchecked.length > 10 ? ", ..." : ""}`
      : ""
  }; ${sharedLimitless.length - sharedUnchecked.length} opened by hand and right`,
);

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
 * Every rarity a binder rule or a Pokédex setting names is one a card can have: a word of the list,
 * one the copy holds, or a collection row's own (binder-rarity-words.mjs says why). A respelling
 * that moves the cards and not the settings empties a binder with no error anywhere.
 */
{
  const [entries, rowWords] = await Promise.all([
    query(
      `select w as entry, count(*)::int as n from (
         select jsonb_array_elements_text(rule -> 'rarities') as w from collections where jsonb_typeof(rule -> 'rarities') = 'array'
         union all
         select jsonb_array_elements_text(pokedex -> 'rarities') from collections where jsonb_typeof(pokedex -> 'rarities') = 'array'
       ) x group by 1`,
    ),
    query("select distinct rarity from cards where rarity is not null"),
  ]);
  const known = [
    ...Object.values(RARITY_WORDS).flat(),
    ...rarities.map((r) => r.rarity),
    ...rowWords.map((r) => r.rarity),
  ];
  const stray = strayRarityEntries(
    entries.map((e) => e.entry),
    known,
  );
  check(
    "Binder and Pokédex rarities are words a card has",
    stray.length === 0,
    `${stray.length} of ${entries.length} words in binder rules and Pokédex settings match no card${
      stray.length
        ? `: ${stray.map((w) => `${w} (${entries.find((e) => e.entry === w)?.n})`).join(", ")}`
        : ""
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
      `select product_id, printing, market::float as market from tcgplayer_prices where updated_on = '${day}' and market is not null`,
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

const jaLinks = JSON.parse(
  readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-ids.ja.generated.json"), "utf8"),
);

/**
 * A printing TCGplayer lists and has no market figure for is priced at its lowest listing, and
 * labelled so (Bart, 2026-09-18; R-DATA-004).
 *
 * The rule is shelfFigureOf() in tcgcsv.ts, which the price job writes tcgplayer_prices with, and
 * priceFromUsd() in price-basis.mjs, which every answer's price is made by. This holds the store to
 * the rule for every linked card, old and new: every linked product's printing tcgcsv publishes
 * with a `lowPrice` and no `marketPrice` has a row with that listing and no market figure, no row
 * holds a listing where tcgcsv has a market figure, and every stored listing becomes a price
 * labelled `lowest-listing` with no market figure. Read against tcgcsv's files, which are the
 * night's until 20:00 UTC.
 */
if (day) {
  const TOLERANCE = 0.011;
  const groupsOf = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-groups.generated.json"), "utf8"),
  );
  /** category to the groups of every linked product, and the linked products themselves. */
  const wanted = { 3: new Set(), 85: new Set() };
  const linkedProducts = new Set();
  for (const v of Object.values(links))
    if (v?.productId) {
      linkedProducts.add(v.productId);
      const g = v.groupId ?? groupsOf["3"]?.[String(v.productId)];
      if (g != null) wanted[3].add(g);
    }
  for (const pid of Object.values(jaLinks))
    if (pid) {
      linkedProducts.add(pid);
      const g = groupsOf["85"]?.[String(pid)];
      if (g != null) wanted[85].add(g);
    }
  const shelf = new Map();
  let unread = 0;
  const pending = Object.entries(wanted).flatMap(([cat, gs]) => [...gs].map((g) => [cat, g]));
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let next = pending.pop(); next; next = pending.pop()) {
        const [cat, groupId] = next;
        const res = await fetch(`https://tcgcsv.com/tcgplayer/${cat}/${groupId}/prices`, {
          headers: { accept: "application/json", "User-Agent": "cardorb.com" },
        }).catch(() => null);
        if (!res?.ok) {
          unread++;
          continue;
        }
        for (const r of (await res.json()).results ?? []) {
          if (!linkedProducts.has(r.productId)) continue;
          shelf.set(`${r.productId}|${printingName(r.subTypeName)}`, shelfFigureOf(r));
        }
      }
    }),
  );
  const stored = new Map(
    (
      await query(
        `select product_id, printing, market::float as market, listing::float as listing from tcgplayer_prices where updated_on = '${day}' and product_id in (${[...linkedProducts].join(",") || "0"})`,
      )
    ).map((r) => [`${r.product_id}|${r.printing}`, r]),
  );
  const rate = 0.9;
  const unlisted = [];
  const wrongListing = [];
  const listingBesideMarket = [];
  const unlabelled = [];
  let listedOnShelf = 0;
  for (const [key, figure] of shelf) {
    if (figure?.market != null) {
      if (stored.get(key)?.listing != null) listingBesideMarket.push(key);
      continue;
    }
    if (figure?.listing == null) continue;
    listedOnShelf++;
    const row = stored.get(key);
    if (!row || row.listing == null) unlisted.push(key);
    else if (row.market != null || Math.abs(row.listing - figure.listing) > TOLERANCE)
      wrongListing.push(`${key} (stored ${row.listing}, tcgcsv ${figure.listing})`);
  }
  for (const [key, row] of stored) {
    if (row.listing == null) continue;
    const price = priceFromUsd({ market: row.market, listing: row.listing }, rate);
    if (price?.basis !== "lowest-listing" || price.market != null || !(price.lowestListing > 0))
      unlabelled.push(key);
  }
  /* A group tcgcsv did not answer this morning leaves its printings unread, not wrong: named, and
     a failure only when most of the shelf is missing. */
  const readEnough = unread <= (wanted[3].size + wanted[85].size) * 0.1;
  const worst = [...unlisted, ...wrongListing, ...listingBesideMarket, ...unlabelled];
  check(
    "A printing with no market figure is priced at its lowest listing",
    readEnough && listedOnShelf > 0 && worst.length === 0,
    `${listedOnShelf} linked printings with a listing and no market figure on ${day}; ${unlisted.length} not stored at their listing, ${wrongListing.length} stored at another figure, ${listingBesideMarket.length} holding a listing beside a market figure, ${unlabelled.length} of ${[...stored.values()].filter((r) => r.listing != null).length} stored listings not labelled as one${
      worst.length ? `: ${worst.slice(0, 10).join("; ")}` : ""
    }; ${unread} of ${wanted[3].size + wanted[85].size} tcgcsv groups did not answer`,
  );
}

// ── What a page would show wrong ────────────────────────────────────────────

/**
 * A card with today's price and no line in the history draws "No readings" on its sheet while its
 * price is shown above it: 4,300 Japanese cards on 2026-09-14 before their history was backfilled.
 * Per catalogue, through the product the copy or the committed map links.
 */
if (day) {
  const [copyProducts, historyIds, pricedProducts] = await Promise.all([
    query(
      "select language, id, tcgplayer_product_id as pid from catalogue_cards where tcgplayer_product_id is not null",
    ),
    query(
      `select distinct language, tcg_id from card_price_months where month >= '${day.slice(0, 7)}-01'::date - interval '1 month'`,
    ),
    query(
      `select distinct product_id from tcgplayer_prices where updated_on = '${day}' and market is not null`,
    ),
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
 * The printings of a linked card, and the cards a link leaves without a price.
 *
 * A link says which TCGplayer product a card is; its `variants` say which printings TCGplayer lists
 * for that product, and those are what a copy's form offers (card-printings.ts printingsOf), which
 * runs a card has and whether it has a plain reverse. They are written by
 * scripts/tcgplayer-links.mjs out of tcgcsv, for every link it sees and whoever made it, so a link
 * added by hand is filled on the next weekly run like any other. Until 2026-09-17 a new link took
 * only the printings that had a market figure that week, so a card linked in a week nobody sold it
 * started with none: the three R/G/B Mew of 30th Celebration (#550) are $7,000 cards with listings
 * and no sale. This holds the committed map to what TCGplayer lists today.
 *
 * A linked card with no line in the price history is the second half of the same question. A
 * product TCGplayer priced and a card with no line is a fault (that is the check above, per day);
 * a product TCGplayer lists and has never put a market figure on can have no line at all, which is
 * not a fault but is worth naming, so an empty printing list is never the silent reason.
 */
{
  const linked = Object.entries(links).filter(([, v]) => v?.productId != null);
  const noPrinting = linked.filter(([, v]) => !(v.variants ?? []).length);
  const groupIds = new Set(
    noPrinting.map(([, v]) => v.groupId).filter((g) => typeof g === "number"),
  );
  /** productId to the printings tcgcsv lists for it, priced this week or not. */
  const listed = new Map();
  let unread = 0;
  const pending = [...groupIds];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let groupId = pending.pop(); groupId != null; groupId = pending.pop()) {
        const res = await fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/prices`, {
          headers: { accept: "application/json", "User-Agent": "cardorb.com" },
        }).catch(() => null);
        if (!res?.ok) {
          unread++;
          continue;
        }
        for (const r of (await res.json()).results ?? [])
          listed.set(r.productId, [...(listed.get(r.productId) ?? []), r.subTypeName]);
      }
    }),
  );
  const fillable = noPrinting.filter(([, v]) => listed.has(v.productId));
  check(
    "Linked cards have the printings TCGplayer lists",
    fillable.length === 0 && unread === 0,
    `${linked.length} linked cards; ${noPrinting.length} with no printing, of which ${fillable.length} TCGplayer lists one for${
      fillable.length
        ? ` (run scripts/tcgplayer-links.mjs): ${fillable
            .slice(0, 10)
            .map(([id, v]) => `${id} (${(listed.get(v.productId) ?? []).join(", ")})`)
            .join("; ")}`
        : ""
    }; ${unread} of ${groupIds.size} tcgcsv groups did not answer`,
  );

  const everPriced = new Set(
    (await query("select distinct product_id from tcgplayer_prices where market is not null")).map(
      (r) => r.product_id,
    ),
  );
  const withLine = new Set(
    (await query("select distinct tcg_id from card_price_months where language = 'en'")).map(
      (r) => r.tcg_id,
    ),
  );
  const noLine = linked.filter(([id]) => !withLine.has(id));
  const shouldHaveOne = noLine.filter(([, v]) => everPriced.has(v.productId));
  check(
    "Linked cards with no price line have a reason",
    shouldHaveOne.length === 0,
    `${noLine.length} of ${linked.length} linked English cards have no price line; ${shouldHaveOne.length} of them on a product TCGplayer has priced${
      shouldHaveOne.length
        ? `: ${shouldHaveOne
            .slice(0, 10)
            .map(([id]) => id)
            .join(", ")}`
        : ""
    }; the rest are products TCGplayer lists and has never put a market figure on${
      noLine.length
        ? `, among them ${noLine
            .slice(0, 6)
            .map(([id]) => id)
            .join(", ")}`
        : ""
    }`,
  );
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
      `select product_id, printing, market::float as market from tcgplayer_prices where updated_on = '${day}' and market is not null and product_id in (${prints.map((p) => p.productId).join(",") || "0"})`,
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
 * A card whose rarity says holo offers a holo. TCGdex writes "normal" for most holo cards of Black &
 * White, XY and Sun & Moon, and until api#495 (2026-09-15) 2,087 of them offered a Standard copy and
 * no holo (Reshiram bw1-113). card-printings.ts offers a holo where TCGdex names one, where the
 * evidence run decided the card is one (holoNotNormal, holoBesideNormal in
 * reverse-holo.generated.json), and where a pre-reverse card's foil is filed as a reverse
 * (holoBeforeReverses). A card named "Holo Rare" (and its V, VMAX, VSTAR, LV.X kin) outside all
 * three is a card a form offers wrongly: the evidence run is behind, or TCGdex changed.
 */
{
  const decided = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "reverse-holo.generated.json"), "utf8"),
  );
  const holoIds = new Set([...(decided.holoNotNormal ?? []), ...(decided.holoBesideNormal ?? [])]);
  const beforeReverses = new Set(decided.holoBeforeReverses ?? []);
  const named = await query(
    "select id, variants from catalogue_cards where language = 'en' and rarity ilike '%holo%' and jsonb_array_length(coalesce(variants, '[]'::jsonb)) > 0",
  );
  const without = named.filter((r) => {
    const types = new Set((r.variants ?? []).map((v) => v.type));
    return !(
      types.has("holo") ||
      holoIds.has(r.id) ||
      (beforeReverses.has(r.id) && types.has("reverse"))
    );
  });
  check(
    "A card whose rarity says holo offers a holo",
    without.length === 0,
    `${named.length} English cards named holo; ${without.length} offer no holo${
      without.length
        ? ` (${without
            .slice(0, 10)
            .map((r) => r.id)
            .join(", ")}): rerun scripts/reverse-holo-evidence.mjs and review its holo lists`
        : ""
    }`,
  );
}

/**
 * A set whose finishes share nothing with TCGplayer's. 30th Celebration and its Classic Collection
 * arrived on 2026-09-16 with TCGdex saying "normal" for all 188 cards, where TCGplayer sells every one
 * as Holofoil only (and Bulbapedia: every card of the set is holofoil), so a form offered each a
 * Standard copy. Per linked set, the cards whose finishes after the evidence run's holo decisions
 * (reverse-holo.generated.json) name nothing TCGplayer's printings name; more than half of a set's
 * compared cards is a set TCGdex filled in wrong, and fails until scripts/reverse-holo-evidence.mjs
 * --sets <id> decides it. A card here and there is a print TCGplayer does not sell apart (Southern
 * Islands' holos it files as reverses, a deck-only reverse), reported.
 *
 * Stored copies follow the decision: a row on a card decided a holo (holoNotNormal) recorded as a
 * normal, or on a card decided plain (normalNotHolo) recorded as a holo, fails too.
 *
 * DISJOINT_PENDING: sets that disagree and that nobody has decided yet, with what the witnesses say.
 * Yellow A Alternate stood here until 2026-09-17, when the consensus rule decided it: TCGdex does not
 * vote for a set it files as plain throughout (HOLO_THROUGHOUT in consensus.mjs), Scrydex files those
 * six cards under their parent sets and says nothing, so TCGplayer's products decide, and its five
 * holofoils are five holos. The pictures agree: xya-107a's card face carries the foil, xya-92a's does
 * not, and TCGplayer sells that one as normal.
 */
const DISJOINT_PENDING = {};
{
  const decided = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "reverse-holo.generated.json"), "utf8"),
  );
  const withVariants = await query(
    "select id, set_id, variants from catalogue_cards where language = 'en' and jsonb_array_length(coalesce(variants, '[]'::jsonb)) > 0",
  );
  const bySet = disjointFinishesBySet(withVariants, links, decided);
  const quoted = (ids) => (ids ?? []).map((id) => `'${id}'`).join(", ") || "''";
  const [stored] = await query(
    `select count(*)::int as n, (array_agg(distinct tcg_id || ' ' || finish))[1:6] as examples from cards
     where language is distinct from 'ja'
       and ((finish = 'normal' and tcg_id in (${quoted(decided.holoNotNormal)}))
         or (finish = 'holo' and tcg_id in (${quoted(decided.normalNotHolo)})))`,
  );
  const wrong = [...bySet].filter(([, v]) => v.disjoint.length * 2 > v.compared);
  const failing = wrong.filter(([id]) => !(id in DISJOINT_PENDING));
  const scattered = [...bySet].filter(
    ([, v]) => v.disjoint.length && v.disjoint.length * 2 <= v.compared,
  );
  const describe = ([id, v]) =>
    `${id} ${v.disjoint.length}/${v.compared} (${v.disjoint.slice(0, 3).join(", ")})`;
  check(
    "A set's finishes overlap TCGplayer's",
    failing.length === 0 && stored.n === 0,
    `${stored.n} stored copies on a finish the decision took away${
      stored.n ? ` (${(stored.examples ?? []).join(", ")})` : ""
    }; ${bySet.size} linked sets compared; ${failing.length} with most cards offering no finish TCGplayer sells${
      failing.length
        ? `: ${failing.map(describe).join("; ")}; run scripts/reverse-holo-evidence.mjs --sets ${failing.map(([id]) => id).join(",")}`
        : ""
    }; pending the owner: ${
      wrong
        .filter(([id]) => id in DISJOINT_PENDING)
        .map(([id, v]) => `${id} ${v.disjoint.length}/${v.compared} (${DISJOINT_PENDING[id]})`)
        .join("; ") || "none"
    }; single cards in ${scattered.length} sets (${scattered.slice(0, 6).map(describe).join("; ")})`,
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
      `select distinct product_id from tcgplayer_prices where updated_on = '${day}' and printing = 'reverse-holofoil' and market is not null`,
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
  const unseenSets = undecidedLinkedCards(variants, links, reverseHolo.cards, disputed);
  const unseen = [...unseenSets.values()].reduce((n, k) => n + k, 0);
  for (const c of variants) {
    const decided = reverseHolo.cards[c.id];
    if (disputed.has(c.id) || decided === undefined) continue;
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
  /* A linked card the evidence run never saw offers the printings card-printings.ts guessed before
     the witnesses (TCGdex's variants alone): a new set, until scripts/reverse-holo-evidence.mjs is
     run for it and its file committed. 30th Celebration and its Classic Collection, on 2026-09-17. */
  check(
    "Every linked card has a reverse holo decision",
    unseen === 0,
    `${unseen} linked cards scripts/reverse-holo-evidence.mjs has not decided${
      unseen
        ? ` (${[...unseenSets]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 8)
            .map(([id, n]) => `${id} ${n}`)
            .join(", ")}): run it and commit reverse-holo.generated.json`
        : ""
    }`,
  );
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

// ── What TCGplayer's products say, held to the rules that read them ─────────────

/**
 * TCGplayer's product for every linked English card: its printed number and its rarity word, one
 * read of tcgcsv per group. The rules in tcgplayer-rules.mjs read the same fields at night and in the
 * weekly links run; these checks compare what is stored and committed with what the rules give
 * today, so a rule that changes, or a new set the rule should have caught, turns a check red.
 */
{
  const tcgLinks = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json"), "utf8"),
  );
  const groupOf =
    JSON.parse(
      readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-groups.generated.json"), "utf8"),
    )["3"] ?? {};
  const classic = JSON.parse(
    readFileSync(
      join(ROOT, "src", "lib", "core", "catalogue", "classic-collection-numbers.generated.json"),
      "utf8",
    ),
  );
  const groupIds = new Set();
  for (const link of Object.values(tcgLinks)) {
    const group = link?.groupId ?? (link?.productId != null ? groupOf[link.productId] : undefined);
    if (group != null) groupIds.add(group);
  }
  const products = new Map();
  let unread = 0;
  const pending = [...groupIds];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let groupId = pending.pop(); groupId != null; groupId = pending.pop()) {
        const res = await fetch(`https://tcgcsv.com/tcgplayer/3/${groupId}/products`, {
          headers: { accept: "application/json", "User-Agent": "cardorb.com" },
        }).catch(() => null);
        if (!res?.ok) {
          unread++;
          continue;
        }
        for (const p of (await res.json()).results ?? []) products.set(p.productId, p);
      }
    }),
  );
  const cards = await query(
    "select id, set_id, local_id, rarity, category, stage, types from catalogue_cards where language = 'en' order by id",
  );
  const productOf = (id) => products.get(tcgLinks[id]?.productId);

  /**
   * Products whose printed number at TCGplayer is a slip, checked against the card: the XY Trainer
   * Kit's Switch is 29/30 and TCGplayer writes 4/30 (Bunnelby's); the Alolan Raichu kit's second
   * Lightning Energy is 3/30 and TCGplayer writes 2/30 (2026-09-17).
   */
  const NUMBER_SLIPS = { "tk-xy-n-29": "4/30", "tk-sm-r-3": "2/30" };
  const wrong = cards.filter((c) => {
    const number = printedNumberOfProduct(productOf(c.id));
    if (!number || NUMBER_SLIPS[c.id] === number) return false;
    return numberDisagrees(classic[c.id] ?? c.local_id, number);
  });
  const uncovered = [...new Set(wrong.filter((c) => !classic[c.id]).map((c) => c.set_id))];
  check(
    "Card labels show the number the card prints",
    unread === 0 && wrong.length === 0,
    `${wrong.length} cards whose label shows another number than TCGplayer's printed one${
      uncovered.length
        ? ` (sets not in classic-collection-numbers.generated.json: ${uncovered.join(", ")})`
        : ""
    }${
      wrong.length
        ? `: ${wrong
            .slice(0, 8)
            .map(
              (c) =>
                `${c.id} ${classic[c.id] ?? c.local_id} vs ${printedNumberOfProduct(productOf(c.id))}`,
            )
            .join(", ")}`
        : ""
    }; ${unread} tcgcsv groups of ${groupIds.size} did not answer`,
  );

  /*
   * Card numbers padded as the cards print them (number-padding.mjs): each set's lowest plain number
   * below ten, as stored, against what number-padding.generated.json (weekly, tcgplayer-links.yml)
   * says the card prints. Red on a set whose spelling is not Scrydex's reading, and on a set the file
   * has no reading for, which is a set published since the last weekly run. TCGplayer's reading is
   * compared with Scrydex's and the sets where they disagree are reported, not failed: TCGplayer pads
   * the Wizards era and the POP Series, which print bare numbers. Two sets neither source prints a
   * number for, both closed products, were read off Bulbapedia on 2026-09-15.
   */
  const NO_PRINTED_SOURCE = {
    "ex5.5": "Poké Card Creator Pack: no Scrydex expansion, no TCGplayer number",
    mfb: "My First Battle: no Scrydex expansion, TCGplayer writes no number",
  };
  const paddingReadings = JSON.parse(
    readFileSync(
      join(ROOT, "src", "lib", "core", "catalogue", "number-padding.generated.json"),
      "utf8",
    ),
  );
  const cardsOfSet = new Map();
  for (const c of cards) {
    if (!cardsOfSet.has(c.set_id)) cardsOfSet.set(c.set_id, []);
    cardsOfSet.get(c.set_id).push({ id: c.id, number: c.local_id });
  }
  const padding = paddingReport(
    [...cardsOfSet.values()]
      .map(paddingWitness)
      .filter(Boolean)
      .map((w) => ({ ...w, classic: w.id in classic })),
    paddingReadings,
  );
  const paddingUnread = padding.unread.filter((id) => !(id in NO_PRINTED_SOURCE));
  check(
    "Card numbers padded as the cards print them",
    padding.wrong.length === 0 && paddingUnread.length === 0,
    `${padding.wrong.length} sets spelt otherwise than Scrydex reads the card${
      padding.wrong.length
        ? ` (${padding.wrong.map((id) => `${id}: ${paddingReadings[id].scrydex}`).join(", ")}; THREE_DIGIT_SETS in card-number.mjs)`
        : ""
    }; ${paddingUnread.length} sets with no reading${
      paddingUnread.length ? ` (${paddingUnread.join(", ")}): run scripts/number-padding.mjs` : ""
    }; reported: Scrydex and TCGplayer disagree on ${padding.disputed.length} sets${
      padding.disputed.length ? ` (${padding.disputed.slice(0, 8).join(", ")})` : ""
    }`,
  );

  /*
   * A Pokémon's types and stage as TCGplayer's product names them (typesDisagree, stageDisagrees).
   * TCGplayer is not right every time (Base Set Arcanine is a Stage 1, TCGplayer says Stage 2), so a
   * difference is a card to look at, not a rule to write. Each one looked at is either put right in
   * card-fact-corrections.ts or named in type-stage-accepted.json with both sides' words and the
   * reason the copy is right (the 126 of 2026-09-17: 2 corrected, 124 TCGplayer's error). A new card
   * that differs, an accepted one whose words moved, or one without a reason fails.
   */
  const acceptedTypeStage = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "catalogue", "type-stage-accepted.json"), "utf8"),
  );
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const typeStageNew = [];
  let typeStageAccepted = 0;
  for (const c of cards) {
    if (c.category !== "Pokemon") continue;
    const product = productOf(c.id);
    if (!product) continue;
    const accepted = acceptedTypeStage[c.id] ?? {};
    const cardType = cardTypeOfProduct(product);
    const stage = stageOfProduct(product);
    const reviewed = typeof accepted.reason === "string" && accepted.reason.trim() !== "";
    if (typesDisagree(c.types, cardType)) {
      if (reviewed && same(accepted.types, [c.types, cardType])) typeStageAccepted++;
      else typeStageNew.push(`${c.id} types ${(c.types ?? []).join("/")} vs ${cardType}`);
    }
    if (stageDisagrees(c.stage, stage)) {
      if (reviewed && same(accepted.stage, [c.stage, stage])) typeStageAccepted++;
      else typeStageNew.push(`${c.id} stage ${c.stage} vs ${stage}`);
    }
  }
  check(
    "Card types and stages as TCGplayer's",
    unread === 0 && typeStageNew.length === 0,
    `${typeStageNew.length} differences unreviewed (not in type-stage-accepted.json with a reason)${
      typeStageNew.length ? `: ${typeStageNew.slice(0, 8).join(", ")}` : ""
    }; ${typeStageAccepted} accepted`,
  );

  /*
   * A stored rarity the rule would write otherwise (tcgplayerRarity): no rarity where TCGplayer names
   * one, or a plain Rare TCGplayer grades higher. Zero once every set has been copied since the rule
   * last changed; 30th Classic Collection's 30 cards on the day it was written (2026-09-17).
   */
  const unruled = cards.filter((c) => {
    const word = rarityOfProduct(productOf(c.id));
    const ruled = tcgplayerRarity(c.rarity, word);
    return (ruled ?? "").toLowerCase() !== (c.rarity ?? "").toLowerCase();
  });
  const unruledSets = new Map();
  for (const c of unruled) unruledSets.set(c.set_id, (unruledSets.get(c.set_id) ?? 0) + 1);
  check(
    "Rarities as TCGplayer's rule gives them",
    unread === 0 && unruled.length === 0,
    `${unruled.length} cards store another rarity than the rule gives${
      unruled.length
        ? `: ${[...unruledSets]
            .slice(0, 8)
            .map(([set, n]) => `${set} ${n}`)
            .join(", ")}`
        : ""
    }`,
  );

  /*
   * A newer set whole and as printed, against TCGplayer's products. 30th Celebration arrived on
   * 2026-09-16 with three RGB Mew TCGplayer sells and TCGdex lacked, "Palkia" and "Metagross" for
   * Palkia LV.X and Metagross δ, no regulation mark on 155 cards that print J, and nothing checked
   * any of it. For every English set released in the last NEWER_SET_DAYS:
   *
   *   - a card TCGplayer sells with a printed number no card of the set has (a numbered product,
   *     patterned prints of a held number included);
   *   - a Pokémon card no species name is found in, which no Pokédex slot takes (species-match.mjs);
   *   - a card of a marked series (Sword & Shield on) with no regulation mark, unless Bulbapedia's
   *     list says it prints none (regulation-marks.generated.json, scripts/regulation-marks.mjs); a
   *     basic Energy prints none.
   *
   * And over every linked card, old or new: a stored name without the LV.X, δ, ☆ or ◇ its product
   * prints (nameWithProductMark, which the nightly copy writes). pokemontcg.io's data on GitHub is
   * read for the newer sets only to report the numbers it lists that the copy lacks (its README: not a
   * primary source).
   */
  const NEWER_SET_DAYS = 365;
  const MARKED_SERIES = new Set(["swsh", "sv", "me"]);
  const marks = JSON.parse(
    readFileSync(
      join(ROOT, "src", "lib", "core", "catalogue", "regulation-marks.generated.json"),
      "utf8",
    ),
  );
  const newerSets = await query(
    `select id, name, serie_id from catalogue_sets where language = 'en' and release_date is not null and replace(release_date::text, '/', '-')::date >= current_date - ${NEWER_SET_DAYS}`,
  );
  const newerIds = new Set(newerSets.map((s) => s.id));
  const facts = new Map(
    (
      await query(
        "select id, name, regulation_mark from catalogue_cards where language = 'en' order by id",
      )
    ).map((r) => [r.id, r]),
  );
  const speciesKeys = speciesIndex(
    JSON.parse(readFileSync(join(ROOT, "src", "lib", "core", "pokedex.generated.json"), "utf8")),
    normalise,
  );
  const notAsPrinted = [];
  for (const c of cards) {
    const product = productOf(c.id);
    const name = facts.get(c.id)?.name;
    if (product && name && nameWithProductMark(name, product.name) !== name)
      notAsPrinted.push(`${c.id} "${name}" vs "${product.name}"`);
  }
  const missing = [];
  const noSpecies = [];
  const noMark = [];
  const ptcgLacks = [];
  const toPtcg = new Map(
    Object.entries(
      JSON.parse(
        readFileSync(join(ROOT, "src", "lib", "core", "catalogue", "ptcg-set-ids.json"), "utf8"),
      ),
    ).map(([ptcg, tcgdex]) => [tcgdex, ptcg]),
  );
  for (const set of newerSets) {
    const own = cards.filter((c) => c.set_id === set.id);
    const labels = own.map((c) => classic[c.id] ?? c.local_id);
    const groups = new Set(own.map((c) => productOf(c.id)?.groupId).filter((g) => g != null));
    for (const p of products.values()) {
      if (!groups.has(p.groupId)) continue;
      const number = printedNumberOfProduct(p);
      if (!number || !(p.extendedData ?? []).some((e) => e.name === "Rarity")) continue;
      if (labels.every((label) => numberDisagrees(label, number)))
        missing.push(`${set.id} ${number} ${p.name}`);
    }
    for (const c of own) {
      const name = facts.get(c.id)?.name ?? "";
      if (
        c.category === "Pokemon" &&
        !nameParts(name)
          .concat(name)
          .some((part) => speciesInKey(normalise(part), speciesKeys) !== null)
      )
        noSpecies.push(c.id);
      if (
        MARKED_SERIES.has(set.serie_id) &&
        !facts.get(c.id)?.regulation_mark &&
        !(c.id in marks && marks[c.id] === null) &&
        // A basic Energy prints none; an Energy Bulbapedia gives a mark is held to it.
        !(c.category === "Energy" && !(c.id in marks))
      )
        noMark.push(c.id);
    }
    const res = await fetch(
      `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${toPtcg.get(set.id) ?? set.id}.json`,
    ).catch(() => null);
    if (res?.ok) {
      const numbers = (await res.json()).map((c) => c.number);
      for (const n of numbers)
        if (labels.every((label) => canonNumber(label.split("/")[0]) !== canonNumber(n)))
          ptcgLacks.push(`${set.id} ${n}`);
    }
  }
  check(
    "Newer sets are whole and named as printed",
    unread === 0 &&
      missing.length === 0 &&
      noSpecies.length === 0 &&
      noMark.length === 0 &&
      notAsPrinted.length === 0,
    `${newerSets.length} sets released in the last ${NEWER_SET_DAYS} days; ${missing.length} numbered TCGplayer cards the copy lacks${
      missing.length ? ` (${missing.slice(0, 6).join(", ")})` : ""
    }; ${noSpecies.length} Pokémon cards with no species${
      noSpecies.length ? ` (${noSpecies.slice(0, 6).join(", ")})` : ""
    }; ${noMark.length} cards without a regulation mark${
      noMark.length ? ` (${noMark.slice(0, 6).join(", ")}): run scripts/regulation-marks.mjs` : ""
    }; ${notAsPrinted.length} linked cards named without the mark their product prints${
      notAsPrinted.length ? ` (${notAsPrinted.slice(0, 4).join(", ")})` : ""
    }; reported: pokemontcg.io lists ${ptcgLacks.length} numbers the copy lacks${
      ptcgLacks.length ? ` (${ptcgLacks.slice(0, 6).join(", ")})` : ""
    }`,
  );
}

/**
 * Every English set's name and release day put to the consensus rule (consensus.mjs, through
 * setFactsAgainst): TCGdex's own record, TCGplayer's group with its era prefix dropped, Scrydex's
 * expansion row and Bulbapedia's day where scripts/release-dates.mjs has read one. Red where a
 * majority of them says something the copy does not, so a set published after the hand comparison of
 * 2026-09-14 is looked at too; put right in set-corrections.ts, which the copy lays over TCGdex. The
 * biases each source is known to have (TCGdex's and Scrydex's month placeholders before Black &
 * White, TCGplayer's dates for the older eras and promo lines, pokemontcg.io's missing "EX") are
 * declared exceptions there, so nothing here has to know about them.
 *
 * Three reads: tcgcsv's group list, Scrydex's expansions page and one TCGdex GraphQL call for every
 * set's raw name and date. Any of them unanswered fails the check, since nothing was compared.
 */
{
  const read = async (url, json) => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "cardorb.com", accept: json ? "application/json" : "text/html" },
      });
      return res.ok ? (json ? res.json() : res.text()) : null;
    } catch {
      return null;
    }
  };
  const graphql = async () => {
    try {
      const res = await fetch("https://api.tcgdex.net/v2/graphql", {
        method: "POST",
        headers: { "User-Agent": "cardorb.com", "content-type": "application/json" },
        body: JSON.stringify({ query: "{ sets { id name releaseDate } }" }),
      });
      return res.ok ? ((await res.json()).data?.sets ?? null) : null;
    } catch {
      return null;
    }
  };
  const [groupList, expansionsHtml, tcgdexSets, copySets] = await Promise.all([
    read("https://tcgcsv.com/tcgplayer/3/groups", true),
    read("https://scrydex.com/pokemon/expansions", false),
    graphql(),
    query(
      "select id, name, serie_id, release_date from catalogue_sets where language = 'en' order by id",
    ),
  ]);
  const tcgdexOf = new Map((tcgdexSets ?? []).map((s) => [s.id, s]));
  const setLinks = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-ids.generated.json"), "utf8"),
  );
  const setGroups = groupsOfSets(
    setLinks,
    JSON.parse(
      readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-groups.generated.json"), "utf8"),
    )["3"] ?? {},
  );
  const ptcgSets = JSON.parse(
    readFileSync(join(ROOT, "src", "lib", "core", "catalogue", "ptcg-set-ids.json"), "utf8"),
  );
  const groupById = new Map((groupList?.results ?? []).map((g) => [g.groupId, g]));
  const expansionOf = new Map(
    scrydexExpansions(expansionsHtml ?? "").map((e) => [ptcgSets[e.code] ?? e.code, e]),
  );
  const off = [];
  const why = [];
  let compared = 0;
  /* A date read off Bulbapedia (release-dates.generated.json) is the set's before Black & White,
     where TCGplayer and Scrydex can agree on a placeholder: EX Team Rocket Returns, November 1 at
     both, November 8, 2004 on Bulbapedia. Kept, and named here. */
  const releaseDates = JSON.parse(
    readFileSync(
      join(ROOT, "src", "lib", "core", "catalogue", "release-dates.generated.json"),
      "utf8",
    ),
  );
  const PROMO_LINES = new Set(PROMO_SETS);
  for (const set of copySets) {
    const group = groupById.get(setGroups.get(set.id));
    const expansion = expansionOf.get(set.id);
    if (!group || !expansion) continue;
    compared++;
    const facts = setFactsAgainst(set, group, expansion, {
      tcgdex: tcgdexOf.get(set.id) ?? null,
      bulbapediaDate: releaseDates.dates[set.id]?.date ?? null,
      promo: PROMO_LINES.has(set.id),
    });
    if (facts.name) off.push(`${set.id} name "${facts.name.stored}" vs "${facts.name.value}"`);
    if (facts.date) off.push(`${set.id} date ${facts.date.stored} vs ${facts.date.value}`);
    if (facts.name || facts.date) why.push((facts.name ?? facts.date).why);
  }
  const answered = groupById.size > 0 && expansionOf.size > 0 && tcgdexOf.size > 0;
  check(
    "Set names and days as the sources agree",
    answered && off.length === 0,
    `${off.length} set facts the sources decide otherwise${off.length ? `: ${off.slice(0, 8).join(", ")}` : ""}${
      why.length ? `; ${why.slice(0, 3).join("; ")}` : ""
    }; ${compared} of ${copySets.length} sets compared${
      answered
        ? ""
        : `; not read: ${groupById.size ? "" : "tcgcsv groups "}${expansionOf.size ? "" : "Scrydex expansions "}${tcgdexOf.size ? "" : "TCGdex sets"}`
    }`,
  );
}

/**
 * Release dates to the day. TCGdex dates about forty English sets to the first of their month, and
 * scripts/release-dates.mjs reads Bulbapedia's day for the ones before Black & White into
 * release-dates.generated.json, which the copy lays over TCGdex's (correctedSet). Red where a set the
 * file dates holds another date, and where a set dated a first is not in the file at all: a set
 * published or changed since the script last ran, whose date may be a placeholder (run the script).
 * Sets Bulbapedia gives no day for (the promo lines, POP Series, trainer kits) are counted.
 */
{
  const file = JSON.parse(
    readFileSync(
      join(ROOT, "src", "lib", "core", "catalogue", "release-dates.generated.json"),
      "utf8",
    ),
  );
  const sets = await query(
    "select id, release_date::text as release_date from catalogue_sets where language = 'en' order by id",
  );
  const stale = sets.filter((s) => file.dates[s.id] && file.dates[s.id].date !== s.release_date);
  const unread = sets.filter(
    (s) =>
      String(s.release_date ?? "").endsWith("/01") &&
      !(s.id in file.dates) &&
      !file.firstOfMonth.includes(s.id) &&
      !(s.id in file.noDay),
  );
  check(
    "Release dates to the day, not the month",
    stale.length === 0 && unread.length === 0,
    `${Object.keys(file.dates).length} sets dated from Bulbapedia, ${stale.length} stored otherwise${
      stale.length
        ? ` (${stale.map((s) => `${s.id} ${s.release_date} vs ${file.dates[s.id].date}`).join(", ")})`
        : ""
    }; ${unread.length} dated a first that scripts/release-dates.mjs has not read${
      unread.length ? ` (${unread.map((s) => `${s.id} ${s.release_date}`).join(", ")})` : ""
    }; ${file.firstOfMonth.length} confirmed on the first; ${Object.keys(file.noDay).length} with no day on Bulbapedia (${Object.keys(file.noDay).slice(0, 8).join(", ")})`,
  );
}

/**
 * The print runs TCGdex names (its variants' `subtype`, kept in the copy since 2026-09-17): Base Set's
 * Unlimited, Shadowless and red-cheeked Shadowless Pikachu, which the sheet offers as editions
 * (runsOfSubtypes in print-runs.mjs, editionsOf). Red where a Base Set card is stored without any run
 * named (the copy is behind TCGdex). Reported: cards whose Shadowless run TCGdex names and TCGplayer
 * links no product for (offered, unpriced), and the runs TCGdex names that no edition is, by kind
 * (the 1999-2000 copyright line, error prints), which only a new edition could offer.
 */
{
  const rows = await query(
    "select id, set_id, variants from catalogue_cards where language = 'en' and set_id in ('base1', 'base2', 'base3', 'base4', 'base5') and jsonb_array_length(coalesce(variants, '[]'::jsonb)) > 0",
  );
  const unnamed = rows.filter(
    (r) => r.set_id === "base1" && !(r.variants ?? []).some((v) => v.subtype),
  );
  const unpricedShadowless = rows.filter(
    (r) => runsOfSubtypes(r.variants).includes("shadowless") && !links[r.id]?.shadowless,
  );
  const unmapped = new Map();
  const named = new Map();
  for (const r of rows)
    for (const kind of new Set((r.variants ?? []).map((v) => v.subtype).filter(Boolean))) {
      if (kind in PRINT_RUN_NAMES) named.set(kind, (named.get(kind) ?? 0) + 1);
      else if (UNMAPPED_SUBTYPES.has(kind)) unmapped.set(kind, (unmapped.get(kind) ?? 0) + 1);
    }
  check(
    "Print runs TCGdex names reach the sheet",
    unnamed.length === 0,
    `${unnamed.length} Base Set cards stored with no run named${
      unnamed.length
        ? ` (${unnamed
            .slice(0, 4)
            .map((r) => r.id)
            .join(", ")}): the copy has not read TCGdex's runs yet`
        : ""
    }; ${unpricedShadowless.length} Shadowless runs with no TCGplayer product; print runs that are no edition, on purpose (the iOS app knows four words and this adds none): ${
      [...named].map(([k, n]) => `${PRINT_RUN_NAMES[k]} ${n}`).join(", ") || "none"
    }; runs nobody has decided yet: ${
      [...unmapped].map(([k, n]) => `${k} ${n}`).join(", ") || "none"
    }`,
  );
}

/**
 * A Japanese card with no rarity is one that prints no mark (japaneseRarity in rarity-names.ts): the
 * rule since 2026-09-14, and 2,545 cards on 2026-09-17. Red where TCGplayer's word for one of them says
 * more than no mark (SAYS_MORE in japanese-rarity-rules.mjs): Scrydex misread the mark, as on M2a-232
 * Mega Dragonite ex, which prints MA. Reported: what TCGplayer calls the rest ("None", "Common"), and
 * how many it has no word for.
 */
{
  const groupOf85 =
    JSON.parse(
      readFileSync(join(ROOT, "src", "lib", "core", "tcgplayer-groups.generated.json"), "utf8"),
    )["85"] ?? {};
  const rows = await query(
    "select id, tcgplayer_product_id as pid from catalogue_cards where language = 'ja' and rarity is null",
  );
  const productOf = (r) => r.pid ?? jaLinks[r.id] ?? null;
  const groups = [...new Set(rows.map((r) => groupOf85[String(productOf(r))]).filter(Boolean))];
  const words = new Map();
  let unread = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let g = groups.pop(); g != null; g = groups.pop()) {
        const res = await fetch(`https://tcgcsv.com/tcgplayer/85/${g}/products`, {
          headers: { accept: "application/json", "User-Agent": "cardorb.com" },
        }).catch(() => null);
        if (!res?.ok) {
          unread++;
          continue;
        }
        for (const p of (await res.json()).results ?? []) {
          const word = p.extendedData?.find((e) => e.name === "Rarity")?.value?.trim();
          if (word) words.set(p.productId, word);
        }
      }
    }),
  );
  const tally = new Map();
  const saysMore = [];
  for (const r of rows) {
    const word = words.get(productOf(r)) ?? "no word";
    tally.set(word, (tally.get(word) ?? 0) + 1);
    if (SAYS_MORE.has(word) || word === "Kagayaku") saysMore.push(`${r.id} ${word}`);
  }
  const defaults = [...tally]
    .filter(([word]) => NEVER_FILLS.has(word))
    .reduce((n, [, count]) => n + count, 0);
  check(
    "Japanese cards without a rarity print no mark",
    unread === 0 && saysMore.length === 0,
    `${rows.length} Japanese cards without a rarity, and they stay without one: ${defaults} of them are TCGplayer's own default for a shelf it has no word for (${[...NEVER_FILLS].join(", ")}), which is never read off a card and never fills a rarity (NEVER_FILLS, Bart 2026-09-17); ${saysMore.length} where TCGplayer's word says more${
      saysMore.length ? ` (${saysMore.slice(0, 6).join(", ")})` : ""
    }; TCGplayer calls the rest: ${[...tally]
      .sort((a, b) => b[1] - a[1])
      .map(([w, n]) => `${w} ${n}`)
      .join(", ")}; ${unread} tcgcsv groups did not answer`,
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
 * A reading JUMP_RATIO times the reading before it, or a tenth of it, at JUMP_FLOOR_CENTS or over:
 * what tcgcsv sent that is not a price moving, on every card, held or not.
 *
 * It asked for a reading three times off *both* neighbours on a card worth at least €10, within one
 * calendar month. Each of those three left the cheap flips out. The level: ecard2-40's normal went
 * €95.08 to 28 cents and back, me02.5-153's cosmos holo 13 cents to €150.57, and a floor on both
 * sides skips a pair the moment one side is cheap, which is every one of them. The shape: the 28
 * cents stood on 31 August and 1 September 2026, so no day had two sane neighbours and the run
 * crossed a month row. Sixty-six such pairs in the three months to 2026-09-20 were invisible here.
 *
 * Two numbers, because they answer different questions. `jumps` is what arrived; `standing` is what
 * is still in the line after price-months.mjs has judged it, which is what a chart, a tile and a
 * collection's value are drawn from. A morning where `standing` climbs is a night to look at, and
 * `jumps` alone climbing is TCGplayer being TCGplayer.
 *
 * Reported, not failed: the market is what it is, and a line that steps to a new level for good
 * (ex10-113's holofoil, 86 cents to €697 on 2026-08-02 and never back) is a relink that stands.
 *
 * Two queries, and the first is a net rather than the rule. It asks which cards have a month row
 * whose own lowest and highest readings are JUMP_RATIO apart, or whose first reading is that far
 * from the month before's last, which is every card a jump can be on and some that have none: a
 * month that climbed tenfold in steps is caught here and thrown out by priceJumps. Deliberately, on
 * cost. Pairing the days themselves in SQL needs a window over every reading in the window months,
 * which measured 2.5 million rows, a 97 MB sort to disk and 11 to 18 seconds on the live database
 * (explain analyze, 2026-09-20); the net reads one row per printing-month, 104,000 of them, and
 * measured 3.5 seconds for 45 cards where the exact pairing found 27.
 *
 * The second reads those cards' whole rows, four months of them, because the stray rule weighs a
 * figure against a month either side and holds it with the figure before it. SPIKE_MAX_CARDS caps
 * what it will ask for: a night where a whole catalogue arrives wrong would otherwise name thousands
 * of cards in one `in` list, and the report says when the cap was reached.
 */
const SPIKE_DAYS = 45;
/** The most cards the second query reads rows for; past it the report says so and takes the first. */
const SPIKE_MAX_CARDS = 400;
{
  const since = new Date(Date.parse(today) - SPIKE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const candidates = await query(
    `with r as (
         select language, tcg_id, printing, month,
                (select min(c) from unnest(cents) c) as lo,
                (select max(c) from unnest(cents) c) as hi,
                (select c from unnest(cents) with ordinality t(c, i)
                 where c is not null order by i limit 1) as first_c,
                (select c from unnest(cents) with ordinality t(c, i)
                 where c is not null order by i desc limit 1) as last_c
         from card_price_months
         where month >= date_trunc('month', current_date - ${SPIKE_DAYS + 5})::date
       ),
       b as (
         select *, lag(last_c) over w as prev_last
         from r window w as (partition by language, tcg_id, printing order by month)
       )
     select distinct language, tcg_id from b
     where (hi >= ${JUMP_FLOOR_CENTS} and hi >= ${JUMP_RATIO} * lo)
        or (prev_last is not null
            and greatest(prev_last, first_c) >= ${JUMP_FLOOR_CENTS}
            and greatest(prev_last, first_c) >= ${JUMP_RATIO} * least(prev_last, first_c))`,
  );
  /* Both halves of the key quoted, not just the id: they come from our own tables, and a value
     that carries a quote would otherwise be a query written by whatever wrote the row. */
  const sqlText = (s) => `'${String(s).replaceAll("'", "''")}'`;
  const asked = candidates.slice(0, SPIKE_MAX_CARDS);
  const rows = asked.length
    ? await query(
        `select r.language, r.tcg_id, r.printing, r.month::text as month, r.cents
         from card_price_months r
         where r.month >= date_trunc('month', current_date - 140)::date
           and (r.language, r.tcg_id) in (${asked
             .map((c) => `(${sqlText(c.language)}, ${sqlText(c.tcg_id)})`)
             .join(", ")})`,
      )
    : [];
  /**
   * The days of every item in `list`, gathered under the line each belongs to.
   *
   * @param {object[]} list
   * @param {(item: object) => string} keyOf the line an item is on
   * @param {(item: object) => [string, number][]} daysOf its readings, date and cents
   */
  const linesOf = (list, keyOf, daysOf) => {
    const lines = new Map();
    for (const item of list)
      lines.set(keyOf(item), [...(lines.get(keyOf(item)) ?? []), ...daysOf(item)]);
    return [...lines].map(([key, days]) => ({ key, days }));
  };
  const jumps = priceJumps(
    linesOf(rows, (r) => `${r.language} ${r.tcg_id} ${r.printing}`, daysOfMonthRow),
    { since },
  );
  /* The same lines as the app reads them: `since` left at the beginning, because daysFromMonths
     weighs the days before the window and holds a figure with the last one before it.

     The printing lines only. A day with none carries the old `market` and `holo` series instead
     (dayPrices), and no such day has been written since 2026-09-13; only
     scripts/backfill-card-prices.mjs still can. Those days count in `jumps` and cannot count here,
     which is worth knowing should the backfill ever fill a month inside this window. */
  const read = daysFromMonths(rows);
  const standing = priceJumps(
    linesOf(
      read.flatMap((d) =>
        Object.entries(d.printings ?? {}).map(([printing, price]) => ({ d, printing, price })),
      ),
      (p) => `${p.d.language} ${p.d.tcgId} ${p.printing}`,
      (p) => [[p.d.date, Math.round(p.price * 100)]],
    ),
    { since },
  );
  const tonight = standing.filter((j) => j.date === day).length;
  const cards = new Set(jumps.map((j) => j.key.split(" ").slice(0, 2).join(" "))).size;
  const shown = (list) =>
    list
      .slice(-10)
      .map((j) => `${j.key} ${j.date} ${j.from}c to ${j.to}c`)
      .join("; ");
  check(
    `Price jumps in ${SPIKE_DAYS} days (reported)`,
    true,
    `${jumps.length} readings ${JUMP_RATIO}× the one before, at €${JUMP_FLOOR_CENTS / 100} or over, on ${cards} cards of the ${candidates.length} the net caught${candidates.length > asked.length ? ` (capped at ${SPIKE_MAX_CARDS}, so this is a floor)` : ""}; ${standing.length} still in the line after the stray rule, ${tonight} of them on ${day ?? "the last day"}${standing.length ? `: ${shown(standing)}` : ""}`,
  );
}

/**
 * A held card's printing whose line jumps five times or more between two readings, at least four
 * times in 90 days: two figures filed under one printing, not a price that moved. Bart, 2026-09-15:
 * Base Set Charizard's 1st Edition read €8,700 and €219 by turns, and the chart looked broken before
 * anyone knew why. The card sheet holds a dip that comes back and starts a line after its last jump
 * (cardorb-web#617, #621); this finds the lines that needed it, so they are seen before a person sees
 * them. Readings under €1 do not count: a cent or two is a jump of five times at that price.
 *
 * FLIP_ACCEPTED holds the lines looked at and left as TCGplayer files them, each with its reason, so
 * a known thin market does not file the issue every morning.
 */
const FLIP_ACCEPTED = new Map([
  [
    "en|base1-4|1st-edition-holofoil",
    "TCGplayer's own market price for a card that hardly sells: $10,000 and $250 by turns with the cheapest listing at $100,000 (tcgcsv, 2026-07-15); the sheet starts the line in April",
  ],
]);
{
  const rows = await query(
    `with held as (
         select distinct case when language = 'ja' then 'ja' else 'en' end as language, tcg_id
         from cards where owned and coalesce(tcg_id, '') <> ''
       )
     select m.language, m.tcg_id, m.printing, m.month::text as month, m.cents
     from card_price_months m join held h using (language, tcg_id)
     where m.month >= date_trunc('month', current_date - 90)::date
       and m.printing not in ('market', 'holo')`,
  );
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  /** @type {Map<string, { day: string, cents: number }[]>} */
  const lines = new Map();
  for (const r of rows) {
    const key = `${r.language}|${r.tcg_id}|${r.printing}`;
    const line = lines.get(key) ?? [];
    (r.cents ?? []).forEach((c, i) => {
      const date = `${r.month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
      if (c != null && date >= since) line.push({ day: date, cents: c });
    });
    lines.set(key, line);
  }
  const flipping = [];
  for (const [key, line] of lines) {
    line.sort((a, b) => (a.day < b.day ? -1 : 1));
    let jumps = 0;
    for (let i = 1; i < line.length; i++) {
      const lo = Math.min(line[i - 1].cents, line[i].cents);
      const hi = Math.max(line[i - 1].cents, line[i].cents);
      if (lo >= 100 && hi >= lo * 5) jumps++;
    }
    if (jumps >= 4) flipping.push({ key, jumps });
  }
  const open = flipping.filter((f) => !FLIP_ACCEPTED.has(f.key)).sort((a, b) => b.jumps - a.jumps);
  const accepted = flipping.length - open.length;
  check(
    "Held price lines do not flip between two levels",
    open.length === 0,
    `${open.length} held printings jumped five times or more at least four times in 90 days${
      open.length
        ? `: ${open
            .slice(0, 10)
            .map((f) => `${f.key.replaceAll("|", " ")} (${f.jumps}×)`)
            .join("; ")}`
        : ""
    }${accepted ? `; ${accepted} accepted (FLIP_ACCEPTED)` : ""}`,
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

/**
 * Only a Pokémon card fills a Pokédex slot. The collection finds a card's Pokémon by the species
 * name inside its name (collection/pokedex.ts), and that alone put 61 English trainers and 77
 * Japanese trainers and Energy in a slot until 2026-09-17: "Aaron's Collection" as Aron, "Hypnotoxic
 * Laser" as Hypno, "Clefairy Doll" as Clefairy, the Spirit Link tools. The rule
 * (fillsPokedexSlot in species-match.mjs) is held over every card of the copy: a card that is not a
 * Pokémon and would still fill a slot fails, and so does a card with no category, which keeps its
 * name match. A Pokémon card no species name is found in is counted against a ceiling: "Buried
 * Fossil" names none, and the Japanese copy holds a few English names from Scrydex.
 */
const POKEMON_WITHOUT_SPECIES_CEILING = { en: 5, ja: 40 };
{
  const english = speciesIndex(
    JSON.parse(readFileSync(join(ROOT, "src", "lib", "core", "pokedex.generated.json"), "utf8")),
    normalise,
  );
  const japanese = speciesIndex(
    JSON.parse(
      readFileSync(join(ROOT, "src", "lib", "core", "species-names.generated.json"), "utf8"),
    ).map((row) => row.ja),
    normaliseLocal,
  );
  const holds = (name, language) =>
    [name, ...nameParts(name)].some(
      (part) =>
        speciesInKey(
          language === "ja" ? normaliseLocal(part) : normalise(part),
          language === "ja" ? japanese : english,
        ) !== null,
    );
  const cards = await query(
    "select id, language, name, local_name, category from catalogue_cards where language in ('en', 'ja')",
  );
  const count = { en: {}, ja: {} };
  const inSlot = [];
  const heldOut = { en: 0, ja: 0 };
  const noSpecies = { en: [], ja: [] };
  let uncategorised = 0;
  for (const c of cards) {
    const name = c.language === "ja" ? (c.local_name ?? c.name) : c.name;
    const named = holds(name, c.language);
    if (c.category == null) uncategorised++;
    if (named && fillsPokedexSlot(c.category)) {
      count[c.language][c.category] = (count[c.language][c.category] ?? 0) + 1;
      if (c.category !== "Pokemon") inSlot.push(`${c.id} ${name}`);
    } else if (named) heldOut[c.language]++;
    if (!named && c.category === "Pokemon") noSpecies[c.language].push(c.id);
  }
  const over = ["en", "ja"].filter((l) => noSpecies[l].length > POKEMON_WITHOUT_SPECIES_CEILING[l]);
  check(
    "Only Pokémon cards fill a Pokédex slot",
    inSlot.length === 0 && uncategorised === 0 && over.length === 0,
    `in a slot: English Pokémon ${count.en.Pokemon ?? 0}, Japanese Pokémon ${count.ja.Pokemon ?? 0}, other cards ${inSlot.length}${
      inSlot.length ? ` (${inSlot.slice(0, 6).join(", ")})` : ""
    }; ${uncategorised} cards without a category; trainers and Energy holding a species name, kept out: English ${heldOut.en}, Japanese ${heldOut.ja}; Pokémon cards naming no species: English ${noSpecies.en.length} of at most ${POKEMON_WITHOUT_SPECIES_CEILING.en} (${noSpecies.en.slice(0, 4).join(", ")}), Japanese ${noSpecies.ja.length} of at most ${POKEMON_WITHOUT_SPECIES_CEILING.ja}`,
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
 * Every account's rows since 2026-09-17: the owner decided the other accounts' 1,336 count
 * (migration 20260917120000), and the write paths put the copy's id on a new row
 * (catalogue-ids.ts), so an id outside the copy is a slip whoever's row it is.
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
    owner.missing === 0 && sum("missing") === 0,
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
 * Every row spells its card as the catalogue copy does: the card's name, its set's name and its
 * printed number. The row carries all three beside the id, and the collection list, the CSV export
 * and the public profile read them off the row, so a spelling that drifted is the same card reading
 * one way there and another on Browse. 193 set names and 90 names were put right by migration
 * 20260920130000 and 1,075 numbers by 20260920160000, which also dropped the constraint that used
 * to forbid the printed spelling. withCatalogueSpelling() spells a new row this way on both write
 * paths, so a count above zero here is a path that forgot it or a catalogue that renamed something
 * since.
 *
 * The check above, "Every copy's number finds its card", is the looser one beside this: it counts a
 * number that does not even fold to its card's, which is a row that has lost its card rather than
 * one that spells it another way.
 *
 * English rows only, as the rule is: a Japanese row's card prints its own script, where the copy's
 * `local_name` and not `name` is the card's name.
 */
{
  const rows = await query(
    `select ${ownerIs} as owner,
            count(*) filter (where c.name is distinct from k.name)::int as names,
            count(*) filter (where c.set_name is distinct from k.set_name)::int as sets,
            count(*) filter (where c.number is distinct from k.local_id)::int as numbers,
            (array_agg(distinct c.tcg_id) filter (where c.name is distinct from k.name
               or c.set_name is distinct from k.set_name
               or c.number is distinct from k.local_id))[1:8] as examples
       from cards c join catalogue_cards k on k.language = 'en' and k.id = c.tcg_id
      where coalesce(c.language, 'en') <> 'ja'
      group by 1`,
  );
  const owner = rows.find((r) => r.owner) ?? { names: 0, sets: 0, numbers: 0, examples: [] };
  const drifted = (r) => r.names + r.sets + r.numbers;
  const others = rows.filter((r) => !r.owner).reduce((n, r) => n + drifted(r), 0);
  check(
    "Every row spells its card as the catalogue does",
    drifted(owner) === 0 && others === 0,
    `${owner.names} of the owner's rows carry another name than their card, ${owner.sets} another set name and ${owner.numbers} another number${
      drifted(owner) ? `: ${(owner.examples ?? []).join(", ")}` : ""
    }; other accounts ${others}`,
  );
}

/**
 * A set marked recorded holds at least one card. `cards_recorded` is what the shelf and the set
 * page go by, and a recorded set with nothing in it is a tile whose page answers null: jumbo, rc,
 * sp and wp carried it on nothing at all (migration 20260920140000), because the English run never wrote the column at
 * all. Both runs now write it from the cards they wrote, so this counts only a set whose cards went
 * missing since.
 */
{
  const empty = await query(
    `select s.language, s.id, s.name from catalogue_sets s
      where s.cards_recorded
        and not exists (select 1 from catalogue_cards c
                         where c.language = s.language and c.set_id = s.id)
      order by s.language, s.id`,
  );
  check(
    "A recorded set holds a card",
    empty.length === 0,
    `${empty.length} sets say they hold cards and hold none${
      empty.length ? `: ${empty.map((r) => `${r.language} ${r.id} ${r.name}`).join(", ")}` : ""
    }`,
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

/**
 * Every fact the consensus rule decides is held by a check that ran this morning.
 *
 * The rule (src/lib/core/consensus.mjs) says where each field comes from; this says that saying it
 * costs something. A field declared with no check, or with the name of a check that no longer runs,
 * is a rule nothing enforces (CONVENTIONS.md), and a field whose check went red this morning is
 * named here too, so the roll call fails with it rather than beside it. Reported: which source each
 * field's biases are declared against, so the report carries the whole rule in one line.
 */
{
  const ran = new Map(checks.map((c) => [c.name, c]));
  const undeclared = Object.entries(FIELDS).filter(([, f]) => !f.held);
  const missing = Object.entries(FIELDS).filter(([, f]) => f.held && !ran.has(f.held));
  const red = Object.entries(FIELDS).filter(([, f]) => ran.get(f.held)?.ok === false);
  const biases = new Map();
  for (const e of EXCEPTIONS) biases.set(e.source, (biases.get(e.source) ?? 0) + 1);
  check(
    "Every fact the consensus rule decides is held by a check",
    undeclared.length === 0 && missing.length === 0 && red.length === 0,
    `${Object.keys(FIELDS).length} fields declared, ${EXCEPTIONS.length} declared exceptions (${[
      ...biases,
    ]
      .sort((a, b) => b[1] - a[1])
      .map(([source, n]) => `${SOURCES[source].name} ${n}`)
      .join(", ")}); ${undeclared.length} fields no check holds${
      undeclared.length ? ` (${undeclared.map(([k]) => k).join(", ")})` : ""
    }; ${missing.length} naming a check that did not run${
      missing.length ? ` (${missing.map(([k, f]) => `${k}: "${f.held}"`).join(", ")})` : ""
    }; ${red.length} whose check failed this morning${
      red.length ? ` (${red.map(([k, f]) => `${k}: "${f.held}"`).join(", ")})` : ""
    }`,
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
