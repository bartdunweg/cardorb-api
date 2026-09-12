/**
 * What one person's binder was worth, one dated point at a time. It reports the
 * readings; it does not record them.
 *
 *   npx next start -p 3111                     # or SITE=https://cardorb.com
 *   node scripts/snapshot-collection-value.mjs --user <uuid>
 *   node scripts/snapshot-collection-value.mjs --user <uuid> --token <jwt>
 *   node scripts/snapshot-collection-value.mjs --user <uuid> --seed   # the archived days too
 *
 * ── Why it no longer writes to collection_value_snapshots ──────────────────
 *
 * It used to upsert on (user_id, snapshot_date): the same row, under the same key, that
 * /api/v1/cron/snapshot writes every night. The two did not agree, and could not.
 *
 * The cron priced a card at the blended two-market figure (Cardmarket's shown price and
 * TCGplayer's market in euros, averaged) until 2026-09-12, and at TCGplayer's alone since
 * (priceFromMarket() in lib/core/price-basis.mjs), over the same assembly every request reads. This script prices from Cardmarket's guide
 * alone, which above €20 is the middle of the Near Mint band. On a €100 card that is
 * 100 × 1.275 = 127.50 against (127.50 + 100) / 2 = 113.75, a step of 12% into a chart
 * that is permanent and that says nothing about why it stepped. Below the band it steps
 * the other way: a €10 card reads 10 × 0.865 = 8.65 here against (8.65 + 10) / 2 = 9.33
 * there, 7% low. A series measured with two instruments is not a series.
 *
 * Teaching it to blend is not on offer. Its reason to exist is the two archived captures
 * below, and there is no second market for 2024-12-30 or 2026-06-17 to blend against:
 * TCGdex' free price-history repo is TCGplayer in dollars, covers 745 of this
 * collection's 1,553 cards, and stopped in June 2025. Its third point, today's, is the
 * cron's own row computed a different way — duplication with a disagreement built in.
 *
 * So it prints, and the numbers are real and worth reading by eye. What was not honest
 * was filing two of them onto a chart of blended ones with no column to say which is
 * which. Recording them again wants that column first: a basis on
 * collection_value_snapshots, and a reader that knows what to do with two of them.
 *
 * --token is how a *private* collection is snapshotted: it is an access token
 * for the account named by --user, and it is what the site's own API is asked
 * with below. Without one, this can only snapshot a public profile. There is
 * deliberately no email/password flow here — that would put a user credential
 * in the environment for no gain over a token you can mint and discard.
 *
 * Why a snapshot rather than a lookup: nobody publishes the history. Cardmarket's
 * API answers with today's price plus its own 1, 7 and 30 day averages and no
 * series, and it has been closed to new applications anyway (see the note on
 * NM_BANDS in lib/price-basis.mjs, which ran into the same wall). TCGdex' free
 * price-history repo is TCGplayer in dollars, covers 745 of this collection's
 * 1,553 cards, and stopped in June 2025. So the series does not exist to be
 * fetched. It has to be recorded, and the nightly cron is what records it; this file
 * reads the past back out of the archive so it can be looked at.
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
 * that date* comes from acquired_at in Postgres, because valuing today's 1,622
 * cards at 2024 prices would answer a question nobody asked: 92% of the
 * collection already existed a year ago, so over recent months the series is
 * almost entirely market movement, and over the earlier ones it is almost
 * entirely buying.
 *
 * It reads the running site for the one thing neither source has, a card's
 * TCGdex id, the same way scripts/localise-images.mjs reads the built site
 * rather than reimplementing what it already does. Postgres knows a card as a
 * set name and a number; Cardmarket knows it as an idProduct; TCGdex is the only
 * thing that joins them, and lib/cards.ts already does that matching properly,
 * subsets and zero-padding and all. Doing it a second time here would be a second
 * source of truth that goes wrong quietly.
 *
 * It asks the collection API for that rather than scraping /cards' RSC flight
 * payload, which is what it used to do and what had silently stopped working:
 * /cards became a redirect to /collection, /collection is behind the proxy, and
 * an unauthenticated fetch landed on /login — so the script found zero cards and
 * threw, for every account including the owner's. The endpoints hand back the
 * same objects the payload did (buildCollection() puts `key` and `tcgId` on every
 * card), as JSON, without the production build the scrape needed.
 *
 * On the service-role client below: lib/storage/supabase.ts says the service key
 * has exactly one legitimate caller, and that rule is about adminClient() inside
 * a request, where a client that cannot name the person it acts for is a hole.
 * This is an offline script, run by a human who typed the uuid, that reads `cards`
 * this way — as do backfill-rarity-types.mjs and audit-collection.mjs. It reads
 * only; the write it used to do is gone for the reason above.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { priceOf, holoPriceOf, shownPrice, copyPriceOf } from "../src/lib/core/price-basis.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
/**
 * tcgId -> Cardmarket idProduct. Cached because it costs 1,553 requests and never moves.
 *
 * `src` is not decoration. ROOT is the repository root, because the .env read below and
 * docs/ are there, and lib/core moved under src/ — so this resolved to a directory that
 * does not exist. existsSync() then said "no cache", every run re-resolved all 1,553 ids
 * from TCGdex, and writeFileSync() ended the run with ENOENT before anything was kept.
 * scripts/backfill-card-prices.mjs had it right, which is how the other three were missed.
 */
const IDS = join(ROOT, "src", "lib", "core", "cardmarket-ids.generated.json");
/** Which product a card's print runs are filed as: scripts/cardmarket-ids-editions.mjs writes it. */
const RUN_IDS = join(ROOT, "src", "lib", "core", "cardmarket-ids.editions.generated.json");

// .env.local, read by hand. The script is run with plain node, which does not
// load it, and adding a dotenv dependency for a handful of lines would be the
// first runtime dependency this project took on for a convenience.
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

const BASE = process.env.SITE ?? "http://127.0.0.1:3111";
const SEED = process.argv.includes("--seed");
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const userId = flag("--user");
/** An access token for --user, for a collection that is not public. */
const TOKEN = flag("--token") ?? process.env.SNAPSHOT_ACCESS_TOKEN;
if (!userId) {
  console.error("\n  --user <uuid> is required — whose collection to value.\n");
  process.exit(1);
}

/** 6 is Pokémon in Cardmarket's game table. Public, no login, rebuilt nightly. */
const GUIDE = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";

/**
 * The only two copies of that file the Internet Archive has, checked against
 * their CDX index (distinct digests and sizes, so they are genuinely two
 * different captures rather than one served twice).
 *
 * `if_` and not `id_`, which is the whole of a bug that cost a historical point
 * on the first real run. Both ask for the bytes as captured rather than the
 * archive's rewritten version, and `id_` is the one the documentation points at
 * — but for the June 2026 capture the Wayback Machine answers `id_` with a 302
 * to the *December 2024* one. fetch follows redirects, so the script quietly
 * received the wrong file, whose own createdAt then reported 2024-12-30, and
 * two guides collided on one date. `if_` returns 200 and the real bytes
 * (createdAt 2026-06-17, 75,404 products) for the same timestamp.
 *
 * The date check below is the real guard, though. A modifier that works today
 * is not a promise, and the failure mode is silent by construction: the archive
 * hands over a valid price guide, just not the one that was asked for.
 */
const ARCHIVED = [
  { at: "2024-12-30", url: "https://web.archive.org/web/20241230185748if_/" + GUIDE },
  { at: "2026-06-17", url: "https://web.archive.org/web/20260617212111if_/" + GUIDE },
];

const get = async (url, what, headers = {}) => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", ...headers } });
  if (!res.ok) throw new Error(`${what}: ${res.status}`);
  return res;
};

/**
 * Every card the site knows about for this collection, as the key it files it
 * under and the TCGdex id it resolved to.
 *
 * Still the built site's own answer rather than a second matcher — just asked
 * for as JSON instead of scraped out of an RSC flight payload. The keys line up
 * with fromPostgres() below by construction: buildCollection() files a card
 * under `${setName}-${number || name}`, which is the same string that function
 * builds from the same two columns.
 *
 * A token is the general answer and works for a private collection; without one
 * this can only ask the public endpoint, which needs the profile to be public.
 * Anything else exits rather than returning an empty map — a snapshot of zero
 * cards would be written down as a collection that lost all its value.
 */
async function cardsFor(profile) {
  const from = TOKEN
    ? {
        url: `${BASE}/api/v1/collection`,
        what: "/api/v1/collection",
        headers: { authorization: `Bearer ${TOKEN}` },
      }
    : {
        url: `${BASE}/api/v1/public/${profile.username}/collection`,
        what: `/api/v1/public/${profile.username}/collection`,
        headers: {},
      };

  if (!TOKEN && !profile.is_public) {
    throw new Error(
      `${profile.username} is not a public profile. Pass --token <jwt> for that account to snapshot a private collection.`,
    );
  }

  console.log(`  ${from.what}`);
  const { sets } = await (await get(from.url, from.what, from.headers)).json();
  const cards = new Map();
  for (const set of sets ?? []) {
    for (const card of set.cards ?? []) {
      if (card.tcgId) cards.set(card.key, card.tcgId);
    }
  }
  // Zero is the failure, not "fewer than five hundred". That floor was a
  // constant about one collection and would have rejected any small account.
  if (!cards.size) {
    throw new Error(
      `${from.what} returned no cards with a TCGdex id. Is ${BASE} serving this code?`,
    );
  }
  return cards;
}

/** Who --user is, so the public endpoint can be addressed and refused early. */
async function profileOf(db) {
  const { data, error } = await db
    .from("profiles")
    .select("username,is_public")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`No profile for ${userId}: ${error.message}`);
  return data;
}

/** The service-role client. See the note in this file's header on why. */
function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Every printing this person holds or wants, with its date and how many of it.
 *
 * acquired_at is deliberately not created_at — see the column's own comment in
 * supabase/migrations/20260814062300_accounts_and_cards.sql — so it is
 * trustworthy here for the same reason a Notion page's created_time used to
 * be: it is when the card entered the binder, not when this row happened to
 * be written.
 *
 * Keyed the way lib/cards.ts keys a card, set name and number, so a card held
 * twice (normal and reverse holo) is one entry. It keeps the rows *as a list*
 * rather than folding them to one date, which is what changed here: the two
 * printings of a card are usually two copies bought at two different times, and
 * `quantity` says there may be more of each. A value asked for as of a date has
 * to be able to count the copies that existed by then, and the old shape — one
 * date and one boolean per key — had already thrown that away.
 *
 * The row is read from Postgres rather than from the collection API even though
 * that API now answers with variants: the endpoint's job here is to resolve
 * TCGdex ids, and quantity is a field the public one has no business carrying.
 * Reading the facts about ownership from the database directly keeps this
 * working the same way whether --token was given or not.
 */
async function fromPostgres(db) {
  /**
   * Paged, and not for tidiness.
   *
   * PostgREST caps a response at a thousand rows and says so only by handing
   * over a thousand rows. This function used to ask for the lot in one go, and
   * on a 1,622 card collection it silently received 1,000 of them — which folded
   * to 886 distinct cards and would have been written down as what the binder was
   * worth. A snapshot that is quietly missing a third of the collection is worse
   * than no snapshot: it draws as the day the owner sold half their cards.
   *
   * The count is asked for explicitly and the loop runs until it has that many,
   * rather than stopping when a page comes back short — the same rule, and the
   * same reasoning, as listRows() in lib/storage/postgres.ts, which has the whole
   * story on its own PAGE constant. Ordered by id so the pages are disjoint:
   * paging an unstable order lets the database return one row twice and another
   * never.
   */
  const PAGE = 1000;
  const rows = [];
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 100 && rows.length < total; page++) {
    const { data, error, count } = await db
      .from("cards")
      .select(
        "set_name,number,name,owned,quantity,acquired_at,finish,edition",
        page === 0 ? { count: "exact" } : {},
      )
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`Postgres query: ${error.message}`);
    if (page === 0 && typeof count === "number") total = count;
    if (!data.length) break;
    rows.push(...data);
  }
  if (Number.isFinite(total) && rows.length < total) {
    throw new Error(`Read ${rows.length} of ${total} rows: the collection came back truncated.`);
  }

  const cards = new Map();
  for (const row of rows) {
    if (!row.set_name) continue;
    const key = `${row.set_name}-${row.number || row.name}`;
    if (!cards.has(key)) cards.set(key, []);
    cards.get(key).push({
      acquired: row.acquired_at.slice(0, 10),
      owned: row.owned,
      // Which printing this copy is, so it can be priced as one. Null reads as
      // normal, exactly as variantPrice() treats it on the page.
      finish: row.finish ?? null,
      edition: row.edition ?? null,
      // Defaulted the way lib/storage/postgres.ts defaults it, and floored at
      // zero so a bad row cannot subtract from the total.
      quantity: Math.max(0, row.quantity ?? 1),
    });
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

const sortKeys = (o) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/**
 * One dated point: what the copies that were in the binder by then were worth at
 * that day's prices.
 *
 * Through priceOf and shownPrice, the same two functions the collection and its
 * dashboard use, so this total and the one on the tile are the same kind of
 * number. Owned only, on the same grounds getCardsStats uses: a wishlist is not
 * a holding.
 *
 * Copies, not cards, and that has to match copiesHeld() in lib/core/collection/cards-stats.ts
 * exactly. The tile says what the binder is worth now and the chart says how it
 * got there; if one counted stacks and the other counted cards, the dashboard
 * would disagree with itself at the seam between two elements sitting one above
 * the other. `cards` below is therefore a copy count too.
 *
 * `unpriced` is not noise worth hiding. In the December 2024 guide most of it is
 * cards from sets that had not been printed yet, which is the honest reason an
 * old point counts fewer cards, and the page should be able to say so. It counts
 * distinct cards rather than copies, matching `priced`: both answer how much of
 * the collection could be valued at all, which is a question about coverage.
 */
function valueAt(guide, cards, ids, acquisitions) {
  const byProduct = new Map(guide.priceGuides.map((r) => [r.idProduct, r]));
  // Committed, not asked for: the runs are written by scripts/cardmarket-ids-editions.mjs, and a
  // day this map does not know a card is a day that card reads its ordinary price, as before.
  const runIds = existsSync(RUN_IDS) ? JSON.parse(readFileSync(RUN_IDS, "utf8")) : {};
  const on = guide.createdAt.slice(0, 10);
  let value = 0;
  let priced = 0;
  let unpriced = 0;
  let held = 0;
  for (const [key, tcgId] of cards) {
    // Every printing of this card that was held by then, however many of each.
    // A row acquired after the snapshot date did not exist yet, which is the
    // whole reason this reads acquired_at rather than valuing today's binder at
    // an old day's prices.
    const mine = (acquisitions.get(key) ?? []).filter((r) => r.owned && r.acquired <= on);
    const copies = mine.reduce((n, r) => n + r.quantity, 0);
    if (!copies) continue;
    held += copies;

    const row = byProduct.get(ids[tcgId]);
    // The Shadowless run is a product of its own in this same guide, so history reads it where
    // the page does: base1-4 Charizard is €3,567 as Shadowless against €583 as the ordinary
    // printing, and a chart that valued it at the second was wrong by six times.
    const runProduct = runIds[tcgId]?.shadowless;
    const runRow = runProduct == null ? undefined : byProduct.get(runProduct);
    // Both printings, the same pair lib/core/collection/snapshot.ts resolves for the cron.
    // The two have to agree: this fills in history and that adds today's point,
    // onto one chart.
    const normal = row && priceOf(row);
    const foil = row && holoPriceOf(row);
    if (!normal && !foil) {
      unpriced++;
      continue;
    }

    let any = false;
    for (const r of mine) {
      // Which price series this copy reads, from price-basis.mjs, which is the only
      // place that rule is written. This line used to test `=== "reverse-holo"` by hand
      // and so priced a Poké Ball or Master Ball copy off the plain series while every
      // other valuation path used the foil one; it wrote the rule out a second time after
      // that, and the run of a copy was the fact it did not know. copyPriceOf() is the rule.
      const each = shownPrice(
        copyPriceOf(r, {
          price: normal || null,
          priceHolo: foil || null,
          priceShadowless: runRow ? priceOf(runRow) : null,
        }),
      );
      if (each == null) continue;
      value += each * r.quantity;
      any = true;
    }
    if (any) priced++;
    else unpriced++;
  }
  return { date: on, value, cards: held, priced, unpriced };
}

const guideFrom = async (url, what) => {
  console.log(`  ${what}`);
  return (await get(url, what)).json();
};

/**
 * The same, for the archived captures, which are allowed to be unavailable.
 *
 * web.archive.org answers 503 under load often enough that a single attempt is
 * not a verdict, and today's reading should not be lost because a capture from
 * 2024 is briefly out of reach. So: three tries with a growing wait, then give
 * up on that one point and carry on with the rest.
 *
 * Loudly, though. A missing historical point is a real loss — there is no daily
 * archive of this file anywhere, so these two captures are all the past there
 * is — and a run that quietly wrote one point instead of three would look
 * exactly like a successful one.
 */
async function archivedGuide({ url, at }) {
  const what = `archived: ${at}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const guide = await guideFrom(url, attempt === 1 ? what : `${what} (try ${attempt})`);
      /**
       * The capture has to be the one that was asked for.
       *
       * Asked for a capture it will not serve, the Wayback Machine does not
       * answer 404 — it redirects to a neighbouring one, and fetch follows it.
       * So a wrong answer arrives as a perfectly valid price guide for a
       * different day, and the only thing that gives it away is its own
       * createdAt. Without this check that file is priced against the
       * collection and written down under the date it claims, which is how a
       * reading of the wrong year ends up on the chart.
       */
      const got = guide?.createdAt?.slice(0, 10);
      if (got !== at) throw new Error(`served the ${got ?? "unknown"} capture, not ${at}`);
      return guide;
    } catch (err) {
      if (attempt === 3) {
        console.warn(`\n  !! ${what} is unavailable (${err.message}).`);
        console.warn(`     That reading is missing from this run. Re-run --seed later for it.\n`);
        return null;
      }
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

const db = adminDb();
const profile = await profileOf(db);
console.log(`${profile.username}${profile.is_public ? " (public)" : ""}`);

const cards = await cardsFor(profile);
console.log(`  ${cards.size} cards with a TCGdex id`);
const acquisitions = await fromPostgres(db);
console.log(`Postgres: ${acquisitions.size} cards with a date`);
const ids = await cardmarketIds([...cards.values()]);

const guides = [await guideFrom(GUIDE, "Cardmarket price guide, today")];
if (SEED) {
  for (const capture of ARCHIVED) {
    const guide = await archivedGuide(capture);
    if (guide) guides.push(guide);
  }
}

/**
 * One point per date, because two guides can claim the same day.
 *
 * It was load-bearing when this upserted — Postgres refuses a batch that hits one
 * conflict target twice, "ON CONFLICT DO UPDATE command cannot affect row a second
 * time" — and it stays because printing one day's value twice, at two different
 * figures, is the same lie in a smaller place.
 *
 * It happens for a real reason worth seeing rather than smoothing over: asked
 * for a capture it cannot serve, web.archive.org will hand back a *different*
 * one, and the guide's own createdAt is then not the date that was asked for.
 * Twice through this loop with one date means one of the two archived readings
 * is not what it claims, so say so instead of quietly keeping whichever came
 * last.
 */
const byDate = new Map();
for (const guide of guides) {
  const point = valueAt(guide, cards, ids, acquisitions);
  if (byDate.has(point.date)) {
    console.warn(
      `  !! two guides both report ${point.date} — the archive served a capture other than the one asked for.`,
    );
    console.warn(`     Keeping one. Re-run --seed later to see the other.`);
  }
  byDate.set(point.date, point);
}
const points = [...byDate.values()];

for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
  console.log(
    `${p.date}  €${Math.round(p.value).toLocaleString("en-GB")}  ${p.priced} of ${p.priced + p.unpriced} cards priced, ${p.cards.toLocaleString("en-GB")} copies`,
  );
}

/**
 * Nothing is written, and that is the change rather than an oversight.
 *
 * These are Cardmarket-guide readings; /api/v1/cron/snapshot writes the blended
 * two-market figure to the same (user_id, snapshot_date) row every night. Putting
 * both on one chart makes it step by about 12% above the Near Mint band's floor and
 * about 7% the other way below it, with nothing on the page to say why. See the top
 * of this file for the arithmetic and for what recording these again would need.
 */
console.log(
  `\n${points.length} reading${points.length === 1 ? "" : "s"} for ${profile.username}, none recorded.`,
);
console.log(
  `The nightly cron owns collection_value_snapshots and prices both markets; these price one.`,
);
