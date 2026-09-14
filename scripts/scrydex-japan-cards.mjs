/**
 * What Scrydex says about every card of the Japanese copy, written to a committed map the nightly
 * copy reads (mirror-language.ts).
 *
 *   node scripts/scrydex-japan-cards.mjs                         # every set, print what it found
 *   node scripts/scrydex-japan-cards.mjs --write                 # write the map
 *   node scripts/scrydex-japan-cards.mjs --sets SV4a,SM2p --write
 *   node scripts/scrydex-japan-cards.mjs --cache /tmp/scrydex-pages.json --write
 *
 * ── Why this exists ──
 *
 * TCGdex's Japanese catalogue has no artist for 5,744 cards, no printed name for 5,518, no evolution
 * for 2,985 Stage 1 and Stage 2 Pokémon, "None" or nothing for 1,670 rarities, and names the old
 * sets' trainers in machine translation (粉末を癒します for Heal Powder, neo4). It also lacks cards
 * outright: Shiny Treasure ex's 127 to 166. Scrydex has all of it, with Bart's permission
 * (2026-09-14), on public pages: an expansion's table and one page per card with the card as JSON.
 *
 * A card page is 500 kB and Scrydex answers 429 past about 200 requests a minute, so the pages are
 * read here, by hand, once, and not at night: a full run is some 16,000 pages and two hours. The
 * cache keeps every page read, so a run cut short picks up where it stopped. The rules that turn
 * what is kept into the copy's facts are in japanese-card-facts.ts.
 *
 * Reads the copy's Japanese cards through the Supabase CLI (or SUPABASE_ACCESS_TOKEN), read-only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  markOf,
  matchScrydexCards,
  parseCardPage,
  parseExpansionTable,
  parseExpansions,
  plainNumber,
  scrydexExpansionFor,
} from "../src/lib/core/catalogue/scrydex-japan-cards.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const PROJECT_REF = "fprjroupecdhosfdrqhv";
const OUT = join(ROOT, "src", "lib", "core", "scrydex-cards.ja.generated.json");
const HOST = "https://scrydex.com";
const HEADERS = { "User-Agent": "cardorb.com" };

const args = process.argv.slice(2);
const write = args.includes("--write");
const argOf = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : null;
};
const onlySets = argOf("--sets")?.split(",") ?? null;
const cacheFile = argOf("--cache") ?? join(tmpdir(), "scrydex-japan-pages.json");

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

/** Everyone waits once Scrydex says 429: the limit is per client, not per request. */
let pausedUntil = 0;

/** A page's text, read only as far as `enough` says, with Scrydex's rate limit waited out. */
async function page(path, enough = () => false) {
  for (let tries = 0; tries < 12; tries++) {
    while (Date.now() < pausedUntil) await sleep(1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${HOST}${path}`, { headers: HEADERS, signal: controller.signal });
      if (res.status === 404) return null;
      if (res.status === 429) {
        pausedUntil = Date.now() + 30_000;
        continue;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      let text = "";
      const decoder = new TextDecoder();
      for await (const chunk of res.body) {
        text += decoder.decode(chunk, { stream: true });
        if (enough(text)) break;
      }
      return text;
    } catch (err) {
      if (tries === 11) throw new Error(`${path}: ${err.message}`);
      await sleep(2000 * (tries + 1));
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return null;
}

/** Every card of one expansion's table, all its pages. */
async function expansionCards(expansion) {
  const cards = [];
  for (let n = 1; n < 20; n++) {
    const html = await page(`/pokemon/expansions/${expansion.slug}/${expansion.code}?page=${n}`);
    const rows = html ? parseExpansionTable(html, expansion.code) : [];
    cards.push(...rows);
    if (!rows.length || !html.includes(`page=${n + 1}`)) break;
  }
  return cards;
}

/** A card's page as parseCardPage keeps it, from the cache where it was read before. */
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
let fresh = 0;
async function cardPage(code, number) {
  const key = `${code}-${number}`;
  if (cache[key] !== undefined) return cache[key];
  const html = await page(`/pokemon/cards/card/${key}`, (text) => {
    const at = text.indexOf('data-terminal-trigger-json-value="');
    return at >= 0 && text.indexOf('"', at + 34) > 0;
  });
  cache[key] = html ? parseCardPage(html) : null;
  if (++fresh % 200 === 0) {
    writeFileSync(cacheFile, JSON.stringify(cache));
    console.error(`  ${fresh} card pages read`);
  }
  return cache[key];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
    }),
  );
  return out;
}

/** TCGdex's stage words, from Scrydex's English subtypes. */
const STAGES = { Basic: "Basic", "Stage 1": "Stage1", "Stage 2": "Stage2", Baby: "Baby" };
const CATEGORIES = { Pokémon: "Pokemon", Trainer: "Trainer", Energy: "Energy" };
const TRAINER_TYPES = {
  Item: "Item",
  Supporter: "Supporter",
  Stadium: "Stadium",
  "Pokémon Tool": "Tool",
  "Technical Machine": "Technical Machine",
};

/** What the map keeps of one Scrydex card: short keys, nothing empty. */
function entryOf(facts, mark, extra = false) {
  const en = facts.en;
  const out = {
    n: en.name ?? undefined,
    j: facts.name ?? undefined,
    m: markOf(facts.mark) ?? mark ?? undefined,
    a: facts.artist ?? undefined,
    e: en.evolvesFrom?.[0] ?? undefined,
  };
  if (extra) {
    out.p = facts.printed ?? undefined;
    out.c = CATEGORIES[en.supertype] ?? undefined;
    out.s = en.subtypes.map((s) => STAGES[s]).find(Boolean) ?? undefined;
    out.tt = en.subtypes.map((s) => TRAINER_TYPES[s]).find(Boolean) ?? undefined;
    out.t = en.types.length ? en.types : undefined;
    out.h = facts.hp ?? undefined;
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== ""));
}

/**
 * A card Scrydex lists and the copy does not have is added only where it prints a number of the set
 * ("127/190", or a deck's basic energy at "132/131", which Bulbapedia lists as the set's too). Not
 * where Scrydex writes "000/051" or no number at all: that is a card it could not place.
 */
const printsANumber = (facts) => {
  const m = /^\s*[A-Za-z-]*(\d+)[a-z]?\s*\/\s*[A-Za-z-]*\d+/.exec(facts?.printed ?? "");
  return !!m && Number(m[1]) > 0 && facts?.number != null;
};

const [sets, rows] = await Promise.all([
  query("select id, name from catalogue_sets where language = 'ja' order by id"),
  query(
    "select id, set_id, local_id, name, local_name from catalogue_cards where language = 'ja' order by id",
  ),
]);
const bySet = new Map();
for (const r of rows) bySet.set(r.set_id, [...(bySet.get(r.set_id) ?? []), r]);
const expansions = parseExpansions((await page("/pokemon/jp/expansions")) ?? "");
console.error(`${expansions.length} Scrydex expansions, ${sets.length} sets in the copy`);

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { cards: {}, sets: {} };
const map = { cards: { ...previous.cards }, sets: { ...previous.sets } };
const report = [];
for (const set of sets) {
  if (onlySets && !onlySets.includes(set.id)) continue;
  /* A card the copy holds because this map added it (`x`) is still Scrydex's to add: counted as the
     copy's own, it would lose its facts and drop out of the copy the next night. */
  const ours = (bySet.get(set.id) ?? []).filter((c) => !previous.cards[c.id]?.x);
  if (!ours.length) continue;
  const expansion = scrydexExpansionFor(expansions, set);
  if (!expansion) {
    report.push(`${set.id}: no Scrydex expansion`);
    continue;
  }
  const listed = await expansionCards(expansion);
  const pages = await mapLimit(listed, 3, (c) => cardPage(expansion.code, c.number));
  const scrydex = listed.map((c, i) => ({ ...c, localName: pages[i]?.name ?? null }));
  const matched = matchScrydexCards(
    scrydex,
    ours.map((c) => ({ id: c.id, number: c.local_id, name: c.name, localName: c.local_name })),
  );
  for (const c of ours) delete map.cards[c.id];
  for (const [id, entry] of Object.entries(map.cards))
    if (entry.x && id.startsWith(`${set.id}-`)) delete map.cards[id];
  const numberOf = new Map([...matched].map(([id, n]) => [n, id]));
  const ourNumbers = new Set(ours.map((c) => plainNumber(c.local_id)));
  const width = Math.max(...ours.map((c) => c.local_id.length));
  let added = 0;
  scrydex.forEach((c, i) => {
    const facts = pages[i];
    if (!facts) return;
    const id = numberOf.get(c.number);
    if (id) {
      map.cards[id] = entryOf(facts, c.mark);
      return;
    }
    if (ourNumbers.has(plainNumber(c.number)) || !printsANumber(facts)) return;
    const local = /^\d+$/.test(c.number) ? c.number.padStart(width, "0") : c.number;
    map.cards[`${set.id}-${local}`] = { ...entryOf(facts, c.mark, true), x: 1 };
    added++;
  });
  const printed = scrydex.filter(
    (c, i) => numberOf.has(c.number) || printsANumber(pages[i]),
  ).length;
  map.sets[set.id] = { code: expansion.code, cards: Math.max(printed, ours.length + added) };
  const unmatched = ours.filter((c) => !matched.has(c.id)).map((c) => `${c.local_id} ${c.name}`);
  report.push(
    `${set.id} (${expansion.code}): ${ours.length} in the copy, ${listed.length} on Scrydex, ${matched.size} matched, ${added} to add${
      unmatched.length ? `; unmatched: ${unmatched.slice(0, 8).join(", ")}` : ""
    }`,
  );
}
writeFileSync(cacheFile, JSON.stringify(cache));
console.log(report.join("\n"));
if (write) {
  const sorted = (o) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, `${JSON.stringify({ cards: sorted(map.cards), sets: sorted(map.sets) })}\n`);
  console.log(
    `wrote ${Object.keys(map.cards).length} cards and ${Object.keys(map.sets).length} sets`,
  );
}
