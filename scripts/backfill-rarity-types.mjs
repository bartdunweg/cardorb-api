/**
 * Rarity and type, moved off whatever a Notion column once said and onto
 * what TCGdex says today. See docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md.
 *
 *   npx tsx scripts/backfill-rarity-types.mjs --user <uuid>              # dry run: logs every diff, writes nothing
 *   npx tsx scripts/backfill-rarity-types.mjs --user <uuid> --write      # the same, and updates Postgres
 *
 * Run with Node 22+ (this repo's own floor — see package.json "engines"):
 * @supabase/supabase-js needs a native WebSocket, which Node 20 does not have.
 *
 * Matches each row to a TCGdex id the same way buildCollection() does in
 * lib/core/cards.ts — resolveSetIds() + fetchSet() + numberForms() to build a
 * byNumber index per set, then sameCard() as the same guard: "a number that
 * resolves to a different Pokémon means the numbering does not line up, and a
 * wrong scan is worse than a missing one" (see ADR-0022, which made the same
 * call for artwork). Imported directly from lib/core rather than copied, so
 * this stays the one matching implementation rather than a second one that
 * drifts.
 *
 * Deliberately not routed through setCatalogue()/lib/core/catalogue.ts: that
 * wraps this same walk in unstable_cache, which needs a running Next.js
 * request context and throws ("incrementalCache missing") called from a bare
 * script. The pieces used below (resolveSetIds, fetchSet, numberForms) are
 * exactly what setCatalogue() calls on a cache miss, just without the request
 * -scoped cache a one-off script has no use for anyway.
 *
 * A row with no TCGdex match is a row buildCollection() would not trust with
 * a scan either — usually because its number does not line up with what the
 * catalogue has there. Guessing a rarity or a type for one of those would
 * repeat exactly the mistake this backfill exists to undo, so those rows are
 * written to docs/rarity-type-backfill-corrections.md instead, a worklist to
 * correct by hand and delete once it is empty — the same shape
 * docs/trainer-gallery-row-corrections.md already took for artwork.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveSetIds } from "../src/lib/core/catalogue.ts";
import { fetchSet, json } from "../src/lib/core/tcgdex-client.ts";
import { numberForms, mapLimit } from "../src/lib/core/util.ts";
import { sameCard } from "../src/lib/core/matching.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const WORKLIST = `${ROOT}docs/rarity-type-backfill-corrections.md`;

// .env.local, read by hand — see scripts/snapshot-collection-value.mjs for why.
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

const WRITE = process.argv.includes("--write");
const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
if (!userId) {
  console.error("\n  --user <uuid> is required — whose rows to backfill.\n");
  process.exit(1);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Every row, paged.
 *
 * This used to be a bare `.select()`, and PostgREST caps a response at 1000
 * rows without saying so — on a 1,968-row collection it silently backfilled
 * half of it and reported success. lib/storage/postgres.ts has carried this
 * loop and its "throw if short" check from the start, for exactly this reason;
 * scripts/audit-collection.mjs hit the same wall and now carries it too.
 */
async function rowsFromPostgres(db) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await db
      .from("cards")
      .select("id,set_name,number,name,rarity,types", { count: "exact" })
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Postgres query: ${error.message}`);
    out.push(...data);
    if (out.length >= (count ?? 0) || !data.length) {
      if (out.length < (count ?? 0)) {
        throw new Error(
          `Postgres returned ${out.length} of ${count} rows — refusing to backfill a partial collection`,
        );
      }
      return out;
    }
  }
}

/** byNumber for one set, the same shape and the same two passes loadSetCatalogue() builds it in. */
async function byNumberFor(setName, setsIndex) {
  const ids = setsIndex.length ? resolveSetIds(setName, setsIndex) : [];
  const details = (await mapLimit(ids, 1, fetchSet)).filter(Boolean);
  const byNumber = {};
  const put = (form, card) => {
    const k = form.toLowerCase();
    if (k in byNumber) return;
    byNumber[k] = { id: card.id, localId: card.localId ?? "", name: card.name ?? "" };
  };
  for (const d of details) {
    for (const card of d.cards ?? []) {
      if (!card.localId) continue;
      for (const form of numberForms(card.localId)) put(form, card);
    }
  }
  // Trainer/Galarian Gallery cards, addressed as "TG04" and the like: the
  // second pass numberForms() also indexes on the bare digits, matching what
  // loadSetCatalogue() does for the same reason.
  for (const d of details) {
    for (const card of d.cards ?? []) {
      const tail = card.localId?.match(/^[A-Za-z]+(\d+[A-Za-z]?)$/)?.[1];
      if (!tail) continue;
      for (const form of numberForms(tail)) put(form, card);
    }
  }
  return byNumber;
}

/** tcgId -> { rarity, types }, asked of TCGdex directly, a handful at a time. */
async function detailsFor(tcgIds) {
  const out = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < tcgIds.length) {
        const id = tcgIds[next++];
        try {
          const card = await json(`https://api.tcgdex.net/v2/en/cards/${id}`, `card ${id}`);
          if (card?.id) out.set(id, { rarity: card.rarity ?? null, types: card.types ?? [] });
        } catch {
          // Left out entirely, so a network blip is retried next run rather
          // than remembered as "TCGdex has no rarity for this card".
        }
      }
    }),
  );
  return out;
}

const sameTypes = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

const db = serviceClient();
const rows = await rowsFromPostgres(db);
console.log(`Postgres: ${rows.length} rows`);

let setsIndex = [];
try {
  setsIndex = await json("https://api.tcgdex.net/v2/en/sets", "sets index");
} catch {
  console.error("No TCGdex set index — nothing can be matched. Aborting.");
  process.exit(1);
}

const bySet = new Map();
for (const row of rows) {
  if (!row.set_name) continue;
  if (!bySet.has(row.set_name)) bySet.set(row.set_name, []);
  bySet.get(row.set_name).push(row);
}

const matched = [];
const unmatched = [];
console.log(`Resolving ${bySet.size} sets against TCGdex…`);
// Three at a time, matching the concurrency lib/core/cards.ts's own set walk
// uses, for the same reason: TCGdex starts refusing requests well before 48
// sets in flight at once.
await mapLimit([...bySet.entries()], 3, async ([setName, setRows]) => {
  const byNumber = await byNumberFor(setName, setsIndex);
  for (const row of setRows) {
    const match = numberForms(row.number)
      .map((form) => byNumber[form.toLowerCase()])
      .find(Boolean);
    const ok = match?.name && sameCard(match.name, row.name);
    if (ok) matched.push({ row, tcgId: match.id });
    else unmatched.push(row);
  }
});
console.log(`${matched.length} rows matched a TCGdex id, ${unmatched.length} did not`);

const details = await detailsFor([...new Set(matched.map((m) => m.tcgId))]);

/**
 * Every previous value, written before anything is updated.
 *
 * scripts/audit-collection.mjs grew one of these for the same reason and this
 * script is the more dangerous of the two: it rewrites a field on hundreds of
 * rows at once, and TCGdex's rarity vocabulary is *coarser* than what some rows
 * already hold — "Special Illustration Rare" becomes "Ultra Rare", which is a
 * real distinction being spent, deliberately, in exchange for one vocabulary
 * across the whole collection (ADR-0041). A decision like that is exactly the
 * kind worth being able to take back.
 */
const undo = [];

let changed = 0;
for (const { row, tcgId } of matched) {
  const detail = details.get(tcgId);
  if (!detail) continue; // TCGdex refused or has nothing for this id; leave the row alone.
  const currentTypes = row.types ?? [];
  const rarityChanged = (row.rarity ?? null) !== detail.rarity;
  const typesChanged = !sameTypes(currentTypes, detail.types);
  if (!rarityChanged && !typesChanged) continue;
  changed++;
  console.log(
    `${row.set_name} #${row.number || "—"} ${row.name}: ` +
      `rarity ${JSON.stringify(row.rarity)} -> ${JSON.stringify(detail.rarity)}, ` +
      `types ${JSON.stringify(currentTypes)} -> ${JSON.stringify(detail.types)}`,
  );
  undo.push({
    id: row.id,
    set: row.set_name,
    name: row.name,
    from: { rarity: row.rarity ?? null, types: currentTypes },
    to: { rarity: detail.rarity, types: detail.types },
  });
}

if (WRITE && undo.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const journal = `${ROOT}docs/rarity-backfill-${stamp}.undo.json`;
  writeFileSync(journal, JSON.stringify(undo, null, 2));
  console.log(`\n  Undo journal: ${journal.replace(ROOT, "")}`);
  for (const entry of undo) {
    const { error } = await db
      .from("cards")
      .update({ rarity: entry.to.rarity, types: entry.to.types })
      .eq("id", entry.id);
    if (error) console.error(`  failed to write ${entry.id}: ${error.message}`);
  }
}
console.log(
  `\n${changed} of ${matched.length} matched rows differ from TCGdex` +
    `${WRITE ? " — written" : " (dry run, nothing written; pass --write to apply)"}`,
);

if (unmatched.length) {
  const bySetName = new Map();
  for (const row of unmatched) {
    const list = bySetName.get(row.set_name ?? "(no set)") ?? [];
    list.push(row);
    bySetName.set(row.set_name ?? "(no set)", list);
  }
  const lines = [
    "# Rarity/type backfill: rows with no confident TCGdex match",
    "",
    "A worklist, not a decision — the reasoning is in",
    "`docs/decisions/0030-tcgdex-source-of-truth-for-rarity-and-type.md`. These rows kept",
    "their existing rarity/type untouched, on the same principle ADR-0022 applied to",
    "artwork: a wrong fact is worse than a missing one. Most of these are the same rows",
    "listed in `trainer-gallery-row-corrections.md`, or promos TCGdex has never indexed.",
    "Fix the underlying number/name mismatch (or accept there is nothing to match), then",
    "re-run this script. Delete this file once it is empty.",
    "",
  ];
  for (const [setName, list] of [...bySetName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${setName} — ${list.length} row${list.length === 1 ? "" : "s"}`, "");
    lines.push("| number | name | current rarity | current types |", "| --- | --- | --- | --- |");
    for (const row of list.sort((a, b) => (a.number || "").localeCompare(b.number || ""))) {
      lines.push(
        `| ${row.number || "—"} | ${row.name} | ${row.rarity ?? "—"} | ${(row.types ?? []).join(", ") || "—"} |`,
      );
    }
    lines.push("");
  }
  writeFileSync(WORKLIST, lines.join("\n"));
  console.log(`${unmatched.length} unmatched rows written to ${WORKLIST}`);
} else if (existsSync(WORKLIST)) {
  console.log(`No unmatched rows. ${WORKLIST} can be deleted.`);
}
