/**
 * Which printing each copy is, worked out from the catalogue rather than guessed.
 *
 *   npx next start -p 3111                                  # or SITE=https://cardorb.com
 *   node scripts/backfill-finish.mjs --user <uuid>          # dry run, writes nothing
 *   node scripts/backfill-finish.mjs --user <uuid> --write
 *
 * ── Why this can be done at all ────────────────────────────────────────────
 *
 * ADR-0048 shipped `cards.finish` empty, on the reasoning that the original
 * hand-kept answers were overwritten by ADR-0030's backfill and nothing left
 * knew which copy was a reverse holo. That was true of *this database* and
 * false of the world: TCGdex publishes, per card, which printings exist —
 * `variants: { normal, reverse, holo, firstEdition, wPromo }` — and that
 * constrains the answer hard enough to remove the guessing.
 *
 * Measured over a 210-card sample of this collection, every card fell into one
 * of two determined cases and none into the ambiguous one:
 *
 *   127  exists only as holo      -> every copy held is a holo
 *    37  exists only as normal    -> every copy held is normal
 *    41  normal and reverse both exist, and exactly two copies are held
 *     5  reverse and holo both exist, likewise
 *
 * ── The case that looks like a guess and is not ────────────────────────────
 *
 * Where a card exists as two printings and two copies are held, this assigns
 * one of each. Which *row* gets which label is arbitrary — nothing records it,
 * and this picks by row id so at least it is stable. What is not arbitrary is
 * the pair: the collection holds one normal and one reverse either way, so
 * every figure computed from it — the value tile, the chart, the snapshot — is
 * exactly right regardless of which row got which.
 *
 * That distinction is the whole licence for this script. It is not filling in a
 * fact it does not know; it is recording a fact about the pair that the
 * catalogue does know, in the only shape the schema has for it. A later Notion
 * import can still correct the row-level assignment, and no total will move
 * when it does.
 *
 * Anything genuinely ambiguous — one copy of a card that exists as two
 * printings, or three copies where two printings exist — is left null and
 * listed in the worklist. Null still means "nobody has said".
 *
 * ── The undo journal is committed this time ────────────────────────────────
 *
 * scripts/backfill-rarity-types.mjs wrote one too, and `.gitignore` matched it,
 * so it was never committed and the values it was protecting are gone. This one
 * writes to docs/finish-backfill-*.undo.json, which nothing ignores. Commit it
 * with the run.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("..", import.meta.url).pathname;
/** tcgId -> which printings exist. Cached: it costs one request per card and never moves. */
const CACHE = join(ROOT, "lib", "core", "card-variants.generated.json");
const WORKLIST = join(ROOT, "docs", "finish-backfill-unresolved.md");

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
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const userId = flag("--user");
const TOKEN = flag("--token") ?? process.env.SNAPSHOT_ACCESS_TOKEN;
const WRITE = args.includes("--write");
const BASE = process.env.SITE ?? "http://127.0.0.1:3111";
if (!userId) {
  console.error("\n  --user <uuid> is required — whose copies to classify.\n");
  process.exit(1);
}

const db = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  return createClient(url, key, { auth: { persistSession: false } });
})();

/** Whose collection, and whether the public endpoint will answer for them. */
const { data: profile, error: profileError } = await db
  .from("profiles")
  .select("username,is_public")
  .eq("id", userId)
  .single();
if (profileError) throw new Error(`No profile for ${userId}: ${profileError.message}`);

/**
 * key -> tcgId, from the built site, exactly as the snapshot script does it.
 * The matching stays lib/core/cards.ts's; this asks for its answer.
 */
async function cardsFor() {
  const url = TOKEN
    ? `${BASE}/api/v1/collection`
    : `${BASE}/api/v1/public/${profile.username}/collection`;
  if (!TOKEN && !profile.is_public) {
    throw new Error(`${profile.username} is not public; pass --token <jwt>.`);
  }
  const res = await fetch(url, { headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {} });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const { sets } = await res.json();
  const out = new Map();
  for (const set of sets ?? [])
    for (const c of set.cards ?? []) if (c.tcgId) out.set(c.key, c.tcgId);
  if (!out.size) throw new Error(`${url} returned no cards with a TCGdex id.`);
  return out;
}

/** Which printings exist, per tcgId, asking TCGdex only about ones never seen. */
async function variantsFor(tcgIds) {
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const missing = tcgIds.filter((id) => !(id in cache));
  if (missing.length) {
    console.log(`  asking TCGdex about ${missing.length} cards`);
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < missing.length) {
          const id = missing[next++];
          try {
            const card = await (await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`)).json();
            const v = card?.variants;
            // null rather than absent for a card TCGdex has no variants for, so
            // the next run does not ask again about a question with no answer.
            cache[id] = v ? ["normal", "reverse", "holo"].filter((k) => v[k]) : null;
          } catch {
            // Left out entirely, so a network blip is retried rather than
            // remembered as "this card has no printings".
          }
        }
      }),
    );
    const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(CACHE, JSON.stringify(sorted, null, 2) + "\n");
  }
  return cache;
}

/** The finish column's own vocabulary, out of TCGdex's. */
const FINISH = { normal: "normal", reverse: "reverse-holo", holo: "holo" };

const cards = await cardsFor();
console.log(`${profile.username}: ${cards.size} cards with a TCGdex id`);

/**
 * Paged, because PostgREST caps a response at a thousand rows and says so only
 * by handing over a thousand rows.
 *
 * `.limit(5000)` does not raise that cap — the first version of this asked for
 * five thousand, got exactly a thousand, and reported "908 held cards, 1000
 * rows" for a 1,969 row collection. It would have classified half the binder
 * and left the rest null with nothing saying why. The identical mistake is
 * written up on listRows() in lib/storage/postgres.ts and was made again here
 * three hours after being fixed in scripts/snapshot-collection-value.mjs, which
 * is the argument for reading that comment rather than trusting a limit.
 *
 * The count is asked for explicitly and the loop runs until it has that many.
 */
const PAGE = 1000;
const rows = [];
{
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 100 && rows.length < total; page++) {
    const { data, error, count } = await db
      .from("cards")
      .select("id,set_name,number,name,owned,finish", page === 0 ? { count: "exact" } : {})
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`Reading rows: ${error.message}`);
    if (page === 0 && typeof count === "number") total = count;
    if (!data.length) break;
    rows.push(...data);
  }
  if (Number.isFinite(total) && rows.length < total) {
    throw new Error(`Read ${rows.length} of ${total} rows: the collection came back truncated.`);
  }
}

const byKey = new Map();
for (const row of rows) {
  if (!row.set_name || !row.owned) continue;
  const key = `${row.set_name}-${row.number || row.name}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(row);
}

const printings = await variantsFor([...cards.values()]);

const plan = [];
const unresolved = [];
for (const [key, held] of byKey) {
  const tcgId = cards.get(key);
  const exists = tcgId ? printings[tcgId] : null;
  if (!exists || !exists.length) {
    unresolved.push({ key, why: "TCGdex has no printings for it", held: held.length });
    continue;
  }
  // Stable order, so a second run makes the same assignment as the first.
  const copies = [...held].sort((a, b) => a.id.localeCompare(b.id));
  if (exists.length === 1) {
    for (const row of copies) plan.push({ row, finish: FINISH[exists[0]] });
  } else if (exists.length === copies.length) {
    // One of each. Which row gets which is arbitrary; the pair is not.
    copies.forEach((row, i) => plan.push({ row, finish: FINISH[exists[i]] }));
  } else {
    unresolved.push({
      key,
      why: `${copies.length} held, ${exists.length} printings exist (${exists.join(", ")})`,
      held: copies.length,
    });
  }
}

const changing = plan.filter((p) => p.row.finish !== p.finish);
const counts = {};
for (const p of changing) counts[p.finish] = (counts[p.finish] ?? 0) + 1;

console.log(`\n${byKey.size} held cards, ${rows.length} rows`);
console.log(
  `  would set: ${changing.length} rows — ${
    Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "nothing"
  }`,
);
console.log(`  left null: ${unresolved.length} cards`);

if (unresolved.length) {
  const lines = [
    "# Finish backfill: cards the catalogue could not settle",
    "",
    'Left null, which still means "nobody has said" — see ADR-0048. Fix by hand,',
    "or wait for an import that knows. Delete this file once it is empty.",
    "",
    "| card | why | copies held |",
    "| --- | --- | --- |",
    ...unresolved.map((u) => `| ${u.key} | ${u.why} | ${u.held} |`),
    "",
  ];
  writeFileSync(WORKLIST, lines.join("\n"));
  console.log(`  worklist: ${WORKLIST.replace(ROOT, "")}`);
}

if (!WRITE) {
  console.log("\nDry run. Pass --write to apply.\n");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const journal = join(ROOT, "docs", `finish-backfill-${stamp}.undo.json`);
writeFileSync(
  journal,
  JSON.stringify(
    changing.map((p) => ({ id: p.row.id, from: p.row.finish ?? null, to: p.finish })),
    null,
    2,
  ) + "\n",
);
console.log(`\n  Undo journal: ${journal.replace(ROOT, "")}  (commit this)`);

let done = 0;
for (const p of changing) {
  const { error: e } = await db.from("cards").update({ finish: p.finish }).eq("id", p.row.id);
  if (e) throw new Error(`Updating ${p.row.id}: ${e.message}`);
  done++;
}
console.log(`  ${done} rows updated.\n`);
