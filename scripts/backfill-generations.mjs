/**
 * Bring the collection's era names into the catalogue's vocabulary.
 *
 *   node scripts/backfill-generations.mjs            # dry run, writes nothing
 *   node scripts/backfill-generations.mjs --apply    # writes
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * An earlier pass stopped rarity and type being hand-typed and backfilled the existing
 * rows from the catalogue. It left `gen` alone without saying why, so the
 * add-card form kept a text box for it — and a text box is a place to make a
 * mistake. The collection carries exactly one "Scarlett & Violet" to prove it.
 *
 * This closes that gap: `gen` is filled from pokemontcg.io's `set.series`
 * now and shown read-only. This script makes the rows written before that agree
 * with the rows written after, so the era filter lists one entry per era rather
 * than two spellings of the same one.
 *
 * ── What it changes, measured before writing ───────────────────────────────
 *
 * Counted against production on 2026-08-21 (1,960 rows, every one with a `gen`):
 *
 *   Scarlet & Violet   1200   already matches the catalogue
 *   Base                334   already matches
 *   Sword & Shield      191   already matches
 *   Mega Evolution      122   already matches
 *   X&Y                  69   -> "XY"
 *   Sun & Moon           43   already matches
 *   Scarlett & Violet     1   -> "Scarlet & Violet"
 *
 * So six of the seven values were already right and 70 rows move. The catalogue
 * publishes 17 series in total; the five it has that this collection does not
 * (Neo, Gym, EX, …) need no mapping because no row uses them.
 *
 * ── It writes past the cache, and that is not a bug ────────────────────────
 *
 * This talks to PostgREST directly, so it does not go through the four write
 * routes that call `revalidateTag(cardsTag(userId))`. The assembled collection
 * is cached for an hour, so **the API and the pages keep serving the
 * old era names for up to an hour after this runs** — measured after the real
 * backfill: the database read `XY` 69 / `X&Y` 0 while
 * /api/v1/public/<name>/collection still answered `X&Y`.
 *
 * Nothing is wrong when that happens and there is nothing to fix. It clears on
 * its own, or immediately if anybody edits a card through the app, which busts
 * the same tag. The rarity/type backfill had the identical property and did not say
 * so, which is the only reason this paragraph exists.
 *
 * ── Why a map rather than a re-lookup ──────────────────────────────────────
 *
 * The rarity/type backfill asked the catalogue per card, because rarity and type are
 * per-card facts that nothing local could derive. An era is a fact about the
 * *set*, and both of these are spelling differences on values that are otherwise
 * identical — so 1,960 network round trips would buy nothing that two string
 * replacements do not. If a third divergence appears later, add it here.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

/** Collection spelling -> catalogue spelling. Nothing else is touched. */
const RENAMES = {
  "X&Y": "XY",
  "Scarlett & Violet": "Scarlet & Violet",
};

function env() {
  const found = {};
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m?.[1] && m[2] !== undefined) found[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? found.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? found.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required.");
    process.exit(1);
  }
  return { url, key };
}

const { url, key } = env();
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

/** Exact count for one value, from the Content-Range header rather than a page
 *  of rows — PostgREST caps a plain select and a truncated list silently
 *  undercounts, which it did while this change was being sized. */
async function countOf(gen) {
  const res = await fetch(`${url}/rest/v1/cards?select=id&gen=eq.${encodeURIComponent(gen)}`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
}

let moved = 0;
for (const [from, to] of Object.entries(RENAMES)) {
  const n = await countOf(from);
  if (!n) {
    console.log(`  ${from} -> ${to}: nothing to do`);
    continue;
  }
  moved += n;
  if (!APPLY) {
    console.log(`  ${from} -> ${to}: ${n} row(s) would change`);
    continue;
  }
  const res = await fetch(`${url}/rest/v1/cards?gen=eq.${encodeURIComponent(from)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ gen: to }),
  });
  if (!res.ok) {
    console.error(`  ${from} -> ${to}: FAILED ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`  ${from} -> ${to}: ${n} row(s) changed`);
}

console.log(
  moved === 0
    ? "\n  every era already matches the catalogue"
    : APPLY
      ? `\n  done — ${moved} row(s) written`
      : `\n  dry run — ${moved} row(s) would change. Re-run with --apply to write.`,
);
