/**
 * Bulbapedia's MediaWiki API, asked politely, and the copy of our catalogue it is compared with.
 *
 * Shared by scripts/bulbapedia-sets.mjs (which set is on which page) and
 * scripts/bulbapedia-compare.mjs (what differs). Bulbapedia's robots.txt asks for five seconds
 * between requests and api.php is open to anyone, so every request here waits its turn, says who
 * is asking, and asks for up to fifty pages at once. A page's wikitext is kept under
 * .cache/bulbapedia with its revision id, so a weekly run fetches only the pages edited since the
 * last one: one info request per fifty pages, and a content request only for the changed ones.
 *
 * The cache is a working file, never committed and never stored in the database: the wiki's text is
 * CC BY-NC-SA 2.5 and nothing of it is kept beyond the report of differences.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = new URL("..", import.meta.url).pathname;
const API = "https://bulbapedia.bulbagarden.net/w/api.php";
const USER_AGENT = "CardOrb naming check (+https://cardorb.com)";
const SPACING_MS = 5_000;
const BATCH = 50;
const CACHE = join(ROOT, ".cache", "bulbapedia");
const PROJECT_REF = "fprjroupecdhosfdrqhv";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
export let requestCount = 0;

/** One API request, five seconds after the last, retried on a busy answer. */
async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + SPACING_MS * (attempt + 1) - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requestCount++;
    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      });
    } catch (error) {
      if (attempt >= 3) throw error;
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      if (body.error) throw new Error(`Bulbapedia: ${body.error.code}: ${body.error.info}`);
      return body;
    }
    if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(
        `Bulbapedia answered ${res.status} for ${params.titles?.slice(0, 80) ?? url}`,
      );
    }
  }
}

const chunks = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/**
 * Where each title lands, redirects followed, and that page's current revision.
 *
 * @returns {Promise<Map<string, { title: string, revid: number } | null>>} null for a page that does not exist
 */
export async function pageInfo(titles) {
  const out = new Map();
  for (const batch of chunks([...new Set(titles)], BATCH)) {
    const body = await api({
      action: "query",
      prop: "info",
      redirects: "1",
      titles: batch.join("|"),
    });
    const q = body.query ?? {};
    const hop = new Map();
    for (const n of q.normalized ?? []) hop.set(n.from, n.to);
    const redirect = new Map();
    for (const r of q.redirects ?? []) redirect.set(r.from, r.to);
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const title of batch) {
      let t = hop.get(title) ?? title;
      for (let i = 0; i < 3 && redirect.has(t); i++) t = redirect.get(t);
      const page = pages.get(t);
      out.set(
        title,
        !page || page.missing || page.invalid ? null : { title: page.title, revid: page.lastrevid },
      );
    }
  }
  return out;
}

const cacheFile = (title) => join(CACHE, `${encodeURIComponent(title).replace(/%/g, "_")}.json`);

/**
 * The wikitext of each page (by its resolved title), from the cache where its revision is current and
 * from Bulbapedia where it is not.
 *
 * @param {Map<string, { title: string, revid: number }>} pages resolved titles with current revisions
 * @returns {Promise<{ texts: Map<string, string>, fetched: number }>}
 */
export async function pageTexts(pages) {
  mkdirSync(CACHE, { recursive: true });
  const texts = new Map();
  const stale = [];
  for (const { title, revid } of pages.values()) {
    if (texts.has(title)) continue;
    const file = cacheFile(title);
    if (existsSync(file)) {
      const cached = JSON.parse(readFileSync(file, "utf8"));
      if (cached.revid === revid) {
        texts.set(title, cached.wikitext);
        continue;
      }
    }
    if (!stale.includes(title)) stale.push(title);
  }
  for (const batch of chunks(stale, BATCH)) {
    let cont = {};
    for (;;) {
      const body = await api({
        action: "query",
        prop: "revisions",
        rvprop: "ids|content",
        rvslots: "main",
        titles: batch.join("|"),
        ...cont,
      });
      for (const p of body.query?.pages ?? []) {
        const rev = p.revisions?.[0];
        const wikitext = rev?.slots?.main?.content;
        if (wikitext == null) continue;
        texts.set(p.title, wikitext);
        writeFileSync(
          cacheFile(p.title),
          JSON.stringify({ title: p.title, revid: rev.revid, wikitext }),
        );
      }
      if (!body.continue) break;
      cont = body.continue;
    }
  }
  return { texts, fetched: stale.length };
}

/**
 * One SQL query's rows, read-only: through the Management API where SUPABASE_ACCESS_TOKEN is set (the
 * workflow), through the linked Supabase CLI otherwise (SUPABASE_CLI, SUPABASE_WORKDIR), as
 * scripts/data-health.mjs asks.
 */
export async function query(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (token) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: true }),
    });
    if (!res.ok) throw new Error(`Query failed (${res.status}): ${await res.text()}`);
    return res.json();
  }
  const cli = process.env.SUPABASE_CLI ?? "supabase";
  const out = execFileSync(cli, ["db", "query", "--linked", sql], {
    cwd: process.env.SUPABASE_WORKDIR ?? ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out.slice(out.indexOf("{"))).rows;
}

/** Every set in the copy, with how many cards the copy holds for it. */
export const ourSets = () =>
  query(
    "select s.language, s.id, s.name, s.local_name, s.series, s.release_date, s.total, s.printed_total, s.cards_recorded, (select count(*) from catalogue_cards c where c.language = s.language and c.set_id = s.id)::int as cards from catalogue_sets s order by s.language, s.release_date, s.id",
  );
