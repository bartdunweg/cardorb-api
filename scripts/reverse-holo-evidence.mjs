/**
 * Decides, card by card, whether a plain reverse holo of it exists, from what four witnesses say,
 * and writes the decision to src/lib/core/reverse-holo.generated.json.
 *
 * Bart, 2026-09-14: the data has to be true, and which printings exist comes before any price. Until
 * then one source decided: TCGdex's variants, and since api#455 TCGplayer's listing on top of them.
 * Neither is right on its own. TCGdex lists no reverse at all for whole eras (every Black & White,
 * XY and most Sun & Moon sets, EX Delta Species to Power Keepers), and TCGplayer lists no reverse
 * figure for cards nobody sells one of (fourteen Skyridge cards whose reverses Bulbapedia names).
 *
 * The witnesses, per card:
 *
 *   - TCGdex: its variants name a plain reverse (a reverse with no foil, or the ex era's energy foil
 *     where TCGplayer sells no Energy Symbol reverse). No answer where TCGdex lists no variants, or
 *     in a set where it names a tenth or less of the reverses TCGplayer or Scrydex name: that is a
 *     set TCGdex never filled in, not a set without them.
 *   - TCGplayer: the card's linked product lists a Reverse Holofoil printing (the weekly list in
 *     tcgplayer-ids.generated.json, or tonight's prices), or its group sells a "(Reverse Holo)"
 *     product with the card's number. No answer without a link.
 *   - Scrydex: its expansion page, with every variant shown, lists a reverseHolofoil variant of the
 *     card (permission from Scrydex, 2026-09-14; only its variants are read, never its prices). No
 *     answer for a card its page does not have.
 *   - Bulbapedia: the set's own rule where its page states one (SET_RULES), and the general one
 *     otherwise: from Legendary Collection on, every card of a main expansion has a reverse
 *     counterpart except Ultra Rares, Secret Rares and full-art cards.
 *
 * The decision is the majority of the first three that answer. Where they tie, Bulbapedia's rule
 * decides; where it has none, TCGdex's word stands. Where Bulbapedia names the cards one by one
 * (POP Series 8 and 9), it decides outright. A card nobody answers for is left out, and
 * card-printings.ts keeps its earlier rule for it.
 *
 * And a second question from the same witnesses: whether a card TCGdex lists as a plain printing
 * only is a holo instead. TCGdex writes "normal" for most holo cards of Black & White, XY and Sun &
 * Moon (Reshiram bw1-113, an Ultra Rare, 2026-09-15), so a form offered a Standard copy and no
 * holo. A card is `holoNotNormal` where TCGdex names a normal and no holo, and TCGplayer's product
 * and Scrydex's page both name a holofoil and no plain printing. Where both name a holofoil and
 * one of them a plain printing too (Emboar bw1-19, whose plain print came in a theme deck), the card
 * is `holoBesideNormal`: the holo is added and the plain card kept. Anything short of both naming a
 * holofoil is left as TCGdex has it.
 *
 * Read-only against the database (the catalogue copy) and polite to Scrydex: one page a second,
 * cached under --cache so a second run asks nothing. About 500 Scrydex pages and 440 tcgcsv requests.
 *
 *   SUPABASE_CLI=… SUPABASE_WORKDIR=… node scripts/reverse-holo-evidence.mjs [--cache <dir>] [--dry]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decideSet, splitKinds } from "../src/lib/core/reverse-holo-rules.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CORE = join(ROOT, "src", "lib", "core");
const OUT = join(CORE, "reverse-holo.generated.json");
const PROJECT_REF = "fprjroupecdhosfdrqhv";
const DRY = process.argv.includes("--dry");
const cacheArg = process.argv.indexOf("--cache");
const CACHE = cacheArg > 0 ? process.argv[cacheArg + 1] : join(ROOT, ".cache", "reverse-holo");
for (const dir of ["scrydex", "tcgcsv"]) mkdirSync(join(CACHE, dir), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One SQL query's rows, as data-health.mjs asks them. */
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
  const out = execFileSync(
    process.env.SUPABASE_CLI ?? "supabase",
    ["db", "query", "--linked", sql],
    {
      cwd: process.env.SUPABASE_WORKDIR ?? ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  return JSON.parse(out.slice(out.indexOf("{"))).rows;
}

/** A page, from the cache or the web; tcgcsv and Scrydex both answer a request that names itself. */
async function cached(file, url, { json = false, pause = 0 } = {}) {
  const path = join(CACHE, file);
  if (existsSync(path))
    return json ? JSON.parse(readFileSync(path, "utf8")) : readFileSync(path, "utf8");
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "curl/8.7.1", accept: "*/*" } });
    if (res.ok) {
      const body = await res.text();
      writeFileSync(path, body);
      if (pause) await sleep(pause);
      return json ? JSON.parse(body) : body;
    }
    /* A page its own site links to and answers 404 for (Scrydex's EX Deoxys, 2026-09-15) is no
       answer for its cards, not a reason to stop the run. */
    if (res.status === 404 && !json) {
      console.error(`${url}: 404, read as empty`);
      return "";
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`${url}: gave up`);
}

/** A printed number without its leading zeros, lowercased: "001" and "1", "TG01" and "tg1" meet. */
const numberKey = (n) => {
  const s = String(n ?? "").toLowerCase();
  const m = s.match(/^([a-z]*)0*(\d+)([a-z]*)$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : s;
};

// ── Bulbapedia ─────────────────────────────────────────────────────────────

/** The series whose main expansions have reverse holos (TCGdex serie ids), from Legendary Collection on. */
const REVERSE_ERAS = new Set([
  "lc",
  "ecard",
  "ex",
  "dp",
  "pl",
  "hgss",
  "col",
  "bw",
  "xy",
  "sm",
  "swsh",
  "sv",
  "me",
]);
/** Sets of those series that are not main expansions, and whose cards Bulbapedia gives no reverse. */
const NOT_A_MAIN_EXPANSION =
  /(^tk-|tg$|gg$|sv$|p$|^sma$|^cel25|^dv1$|^xy0$|^xya$|^exu$|^ex5\.5$|^mfb$|^sve$|^mee$|^bog$|^fut2020$|^det1$|^ru1$)/;
/**
 * The rarities Bulbapedia's general rule leaves without a reverse ("excluding Ultra Rare and Secret
 * Rare cards, and any full-art cards", Holofoil, Reverse Holofoil). TCGdex's words, one spelling.
 */
const NO_REVERSE_RARITIES = new Set([
  "Ultra Rare",
  "Secret Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "Mega Hyper Rare",
  "Double Rare",
  "Holo Rare V",
  "Holo Rare VMAX",
  "Holo Rare VSTAR",
  "Shiny Ultra Rare",
  "Shiny Rare V",
  "Shiny Rare VMAX",
  "LEGEND",
  "Full Art Trainer",
  "Black White Rare",
  "Radiant Rare",
  "Amazing Rare",
]);

/**
 * What a set's Bulbapedia page says of its reverses where it says more than the general rule, read
 * 2026-09-14. Each returns whether a card of the set has a plain reverse.
 */
const SET_RULES = {
  // "all cards in the set also available as Reverse Holo other than the basic energy cards"
  ecard1: {
    rule: "every card but the basic Energy",
    has: (c) => !/^(Grass|Fire|Water|Lightning|Psychic|Fighting) Energy$/.test(c.name),
  },
  // "all cards except the "H/32" and secret rare cards also available as Reverse Holos"
  ecard2: {
    rule: "every card but the H cards and the Secret Rares",
    has: (c) => !/^H/i.test(c.local_id) && c.rarity !== "Secret Rare",
  },
  // "all cards except the "H/32" cards"; "the secret rare cards are also available as Reverse Holos"
  ecard3: {
    rule: "every card but the H cards, Secret Rares included",
    has: (c) => !/^H/i.test(c.local_id),
  },
  // The six cards "also have an holographic version like the Rotom cards from Rising Rivals (Cracked
  // Ice Reverse Holo)", which TCGplayer prices as their Reverse Holofoil. Stated card by card, so it
  // decides.
  pop8: {
    rule: "Carnivine, Cherrim, Chimchar, Croagunk, Luxio and Riolu only (Cracked Ice)",
    decides: true,
    has: (c) => ["6", "7", "8", "12", "13", "16"].includes(numberKey(c.local_id)),
  },
  // "a reverse holographic version of Raichu (3) came in the Supreme Victors Value Pack"
  pop9: { rule: "Raichu only", decides: true, has: (c) => numberKey(c.local_id) === "3" },
  // "There is no Reverse Holo parallel set for Celebrations"
  cel25: { rule: "none", has: () => false },
  // "All Basic Energy cards were only included as Reverse Holofoil"
  col1: {
    rule: "every card but the Pokémon LEGEND and Shiny cards; basic Energy only as reverses",
    has: (c) => !NO_REVERSE_RARITIES.has(c.rarity) && !/^SL/i.test(c.local_id),
  },
};

/** Bulbapedia's answer for a card: its set's rule, the general rule for a main expansion, or null. */
function bulbapedia(card) {
  const own = SET_RULES[card.set_id];
  if (own) return { rule: own.rule, has: own.has(card), decides: own.decides === true };
  if (!REVERSE_ERAS.has(card.serie_id ?? "") || NOT_A_MAIN_EXPANSION.test(card.set_id)) return null;
  return {
    rule: "every card but Ultra Rares, Secret Rares and full-art cards",
    has: !NO_REVERSE_RARITIES.has(card.rarity),
  };
}

// ── The witnesses ──────────────────────────────────────────────────────────

const cards = (
  await query(
    "select c.id, c.set_id, c.local_id, c.name, c.rarity, c.variants, s.name as set_name, s.serie_id, s.release_date::text as released from catalogue_cards c left join catalogue_sets s on s.language = c.language and s.id = c.set_id where c.language = 'en' and coalesce(s.serie_id, '') <> 'tcgp'",
  )
).sort((a, b) => a.id.localeCompare(b.id));
console.error(`catalogue: ${cards.length} English cards`);

const links = JSON.parse(readFileSync(join(CORE, "tcgplayer-ids.generated.json"), "utf8"));
const patterns = JSON.parse(readFileSync(join(CORE, "tcgplayer-patterns.generated.json"), "utf8"));
const ptcgToTcgdex = JSON.parse(readFileSync(join(CORE, "catalogue", "ptcg-set-ids.json"), "utf8"));

// tcgcsv: every English group's products and tonight's printings.
const { results: groups } = await cached(
  "tcgcsv/groups.json",
  "https://tcgcsv.com/tcgplayer/3/groups",
  { json: true },
);
const printingsOf = new Map();
const groupOf = new Map();
const reverseProducts = new Set();
for (const g of groups) {
  const [products, prices] = await Promise.all([
    cached(
      `tcgcsv/${g.groupId}-products.json`,
      `https://tcgcsv.com/tcgplayer/3/${g.groupId}/products`,
      { json: true },
    ),
    cached(
      `tcgcsv/${g.groupId}-prices.json`,
      `https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`,
      { json: true },
    ),
  ]);
  for (const p of prices.results ?? [])
    printingsOf.set(p.productId, new Set([...(printingsOf.get(p.productId) ?? []), p.subTypeName]));
  for (const p of products.results ?? []) {
    groupOf.set(p.productId, g.groupId);
    const number = p.extendedData?.find((e) => e.name === "Number")?.value;
    // "Basic Darkness Energy (Reverse Holofoil)": a reverse sold as a product of its own. Not a
    // patterned one ("Reverse Cosmos Holo", "Mirror Reverse Holo"), which is another printing.
    if (number && /\(reverse holo(foil)?\)/i.test(p.name))
      reverseProducts.add(`${g.groupId}|${numberKey(number.split("/")[0])}`);
  }
}
console.error(`tcgcsv: ${groups.length} groups`);

// Scrydex: every English expansion page with all variants shown, page by page.
const expansionsHtml = await cached(
  "scrydex/expansions.html",
  "https://scrydex.com/pokemon/expansions",
  { pause: 1000 },
);
const expansions = [
  ...new Set(
    [...expansionsHtml.matchAll(/href="(\/pokemon\/expansions\/[^"/]+\/([^"/]+))"/g)].map(
      (m) => m[1],
    ),
  ),
].filter((path) => !path.endsWith("_ja"));
const scrydex = new Map();
for (const path of expansions) {
  const code = path.split("/").pop();
  const variants = new Map();
  for (let page = 1; page < 40; page++) {
    const html = await cached(
      `scrydex/${code}-${page}.html`,
      `https://scrydex.com${path}?show_all_variants=true&page=${page}`,
      { pause: 1000 },
    );
    const before = [...variants.values()].reduce((n, v) => n + v.size, 0);
    for (const m of html.matchAll(
      /href="\/pokemon\/cards\/[^"/]*\/([^"?]+)\?variant=([A-Za-z0-9]+)"/g,
    )) {
      const number = numberKey(
        m[1].startsWith(`${code}-`) ? m[1].slice(code.length + 1) : m[1].split("-").pop(),
      );
      variants.set(number, new Set([...(variants.get(number) ?? []), m[2]]));
    }
    if ([...variants.values()].reduce((n, v) => n + v.size, 0) === before) break;
  }
  scrydex.set(ptcgToTcgdex[code] ?? code, variants);
}
console.error(`scrydex: ${scrydex.size} expansions`);

const witnessed = cards.map((c) => {
  const variants = Array.isArray(c.variants) ? c.variants : [];
  const energySold = (patterns[c.id]?.finishPrints ?? []).some((p) => p.finish === "energy-symbol");
  /* A plain reverse is one with no foil named. A named foil is another printing (a ball, cosmos,
     cracked ice, tinsel) or a stamp on one (league, player-reward), with one exception: the ex
     era's energy foil is those sets' plain reverse, where TCGplayer sells no Energy Symbol reverse. */
  const tcgdex = variants.length
    ? variants.some((v) => {
        const foil = (v.foil ?? "").toLowerCase();
        return v.type === "reverse" && (foil === "" || (foil === "energy" && !energySold));
      })
    : null;
  const link = links[c.id];
  let tcgplayer = null;
  if (link?.productId) {
    const tonight = printingsOf.get(link.productId) ?? new Set();
    const listed = link.variants ?? [];
    if (listed.length || tonight.size)
      tcgplayer =
        listed.some((v) => v.endsWith("reverse-holofoil")) ||
        tonight.has("Reverse Holofoil") ||
        reverseProducts.has(`${groupOf.get(link.productId)}|${numberKey(c.local_id)}`);
  }
  const onScrydex = scrydex.get(c.set_id)?.get(numberKey(c.local_id));
  /* Holo or plain: the three answers about the card's non-reverse printing. */
  const types = new Set(variants.map((v) => v.type));
  const sold = link?.productId
    ? new Set([
        ...(link.variants ?? []),
        ...[...(printingsOf.get(link.productId) ?? [])].map((s) =>
          s.toLowerCase().replace(/\s+/g, "-"),
        ),
      ])
    : new Set();
  return {
    card: c,
    tcgdex,
    tcgplayer,
    scrydex: onScrydex ? onScrydex.has("reverseHolofoil") : null,
    holo:
      types.has("normal") &&
      !types.has("holo") &&
      (sold.has("holofoil") || sold.has("unlimited-holofoil")) &&
      !!onScrydex?.has("holofoil")
        ? sold.has("normal") || sold.has("unlimited") || onScrydex.has("normal")
          ? "beside"
          : "instead"
        : null,
  };
});

/* A set TCGdex never filled in: a plain reverse on fewer than a tenth of the cards another witness
   names one on, where that is a quarter of the set or more (Unified Minds: 2 against TCGplayer's
   and Scrydex's 196 of 258). Its silence there is no answer. */
const bySet = new Map();
for (const w of witnessed) bySet.set(w.card.set_id, [...(bySet.get(w.card.set_id) ?? []), w]);
for (const rows of bySet.values()) {
  const others = rows.filter((w) => w.tcgplayer || w.scrydex).length;
  if (rows.filter((w) => w.tcgdex).length < others / 10 && others >= rows.length / 4)
    for (const w of rows) w.tcgdex = null;
}

const decisions = {};
const sets = {};
/** Cards sold before reverse holos whose foil print TCGdex files as a reverse: the holo it is. */
const holoBeforeReverses = [];
for (const [setId, rows] of [...bySet].sort(([a], [b]) => a.localeCompare(b))) {
  const decided = decideSet(rows, { released: rows[0].card.released, bulbapedia });
  Object.assign(decisions, decided.decisions);
  for (const w of rows)
    if (decided.era && decided.decisions[w.card.id] === false) {
      const named = (Array.isArray(w.card.variants) ? w.card.variants : []).some(
        (v) => v.type === "reverse" && !v.foil,
      );
      if (named) holoBeforeReverses.push(w.card.id);
    }
  const splits = splitKinds(rows, decided.decisions);
  const count = (key) => rows.filter((w) => w[key]).length;
  const answered = (key) => rows.filter((w) => w[key] != null).length;
  sets[setId] = {
    name: rows[0].card.set_name,
    cards: rows.length,
    tcgdex: `${count("tcgdex")}/${answered("tcgdex")}`,
    tcgplayer: `${count("tcgplayer")}/${answered("tcgplayer")}`,
    scrydex: `${count("scrydex")}/${answered("scrydex")}`,
    bulbapedia: decided.era ? "none: sold before Legendary Collection" : decided.rule,
    reverse: Object.values(decided.decisions).filter(Boolean).length,
    ...(decided.exceptions.length ? { energyExceptions: decided.exceptions } : {}),
    ...(splits.length
      ? {
          splits: splits.map(
            (k) =>
              `${k.kind}: ${k.yes.length} with (${k.yes.slice(0, 4).join(", ")}), ${k.no.length} without (${k.no.slice(0, 4).join(", ")})`,
          ),
        }
      : {}),
    ...(decided.disputed.length ? { disputed: decided.disputed } : {}),
  };
}

const holoNotNormal = witnessed
  .filter((w) => w.holo === "instead")
  .map((w) => w.card.id)
  .sort();
const holoBesideNormal = witnessed
  .filter((w) => w.holo === "beside")
  .map((w) => w.card.id)
  .sort();
console.error(
  `TCGdex lists as normal: ${holoNotNormal.length} holos, ${holoBesideNormal.length} with a holo beside the plain card`,
);

const disputedCount = Object.values(sets).reduce((n, s) => n + (s.disputed?.length ?? 0), 0);
console.error(
  `decided ${Object.keys(decisions).length} cards: ${Object.values(decisions).filter(Boolean).length} with a plain reverse; ${disputedCount} disputed`,
);
if (!DRY)
  writeFileSync(
    OUT,
    `${JSON.stringify({ sets, holoBeforeReverses: holoBeforeReverses.sort(), holoNotNormal, holoBesideNormal, cards: decisions }, null, 1)}\n`,
  );
