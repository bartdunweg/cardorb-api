/**
 * The Notion database into Postgres, once.
 *
 *   node scripts/import-notion.mjs --user <uuid>            # counts and a sample
 *   node scripts/import-notion.mjs --user <uuid> --commit   # writes
 *
 * Dry by default, and that is not politeness. This is the one operation in the
 * whole migration that puts sixteen hundred rows somewhere new, and the thing
 * you want to find out *before* it runs is whether the mapping is right — not
 * after, by reading a binder that has every card filed under the wrong set.
 * So the default run reads Notion, builds every row, and prints what it would
 * do without opening a write connection at all.
 *
 * Idempotent. Every row carries its Notion page id as source_id, and the
 * partial unique index on (user_id, source, source_id) means a second run adds
 * only what is new. Run it again next month; run it twice by accident; both are
 * fine.
 *
 * Why the query loop is duplicated here rather than imported: Node cannot
 * import a .ts file, and lib/storage/notion.ts is TypeScript. The project has
 * met this before and answered it the same way — see the note at the top of
 * lib/core/price-basis.mjs, which exists for exactly this reason. The
 * duplication is thirty lines of paging and it is checked against the real
 * database every time this runs, which is the honest kind of duplication.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY, which bypasses every row level policy. That
 * is the point — an import has no signed-in caller to be — and it is also why
 * this is a script you run rather than a route anybody can reach.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("..", import.meta.url).pathname;

// .env.local, read by hand. The script is run with plain node, which does not
// load it, and adding a dotenv dependency for six lines would be the first
// runtime dependency this project took on for a convenience.
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
const commit = args.includes("--commit");
const userId = args[args.indexOf("--user") + 1];

const NOTION_VERSION = "2022-06-28";
const TRADING_DATABASE = "cfae17e0-bdab-4ca0-9b27-d3baac32b2ae";

const die = (message) => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

if (!args.includes("--user") || !userId || userId.startsWith("--")) {
  die("Which account? node scripts/import-notion.mjs --user <uuid> [--commit]");
}
if (!/^[0-9a-f-]{36}$/i.test(userId)) {
  die(`"${userId}" is not a uuid. It is the id from Supabase's auth.users table.`);
}

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!NOTION_TOKEN) die("NOTION_TOKEN is not set: there is nothing to read.");
if (commit && (!SUPABASE_URL || !SERVICE_KEY)) {
  die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to write.");
}

/** A title or rich-text column as one string. */
const text = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");

/** One column off a row, found loosely by name. Mirrors fieldOf() in lib/storage/notion.ts. */
function fieldOf(props, match) {
  for (const [name, p] of Object.entries(props)) {
    if (!match.test(name)) continue;
    const value =
      p.select?.name ??
      (p.multi_select ?? [])
        .map((o) => o.name)
        .filter(Boolean)
        .join(", ") ??
      "";
    const out = value || text(p) || (typeof p.number === "number" ? String(p.number) : "");
    if (out) return out;
  }
  return null;
}

async function notionRows() {
  const rows = [];
  let skipped = 0;
  let cursor;

  for (let page = 0; page < 30; page++) {
    const res = await fetch(`https://api.notion.com/v1/databases/${TRADING_DATABASE}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) die(`Notion refused the query (${res.status}). Is the database shared with it?`);

    const body = await res.json();
    for (const p of body.results ?? []) {
      const props = p.properties ?? {};
      const name = text(props.Name);
      const setName = props.Set?.select?.name ?? "";
      // The same two guards the app applies: a row with no set cannot be placed
      // and one with no name cannot be drawn. Counted, so the summary can say
      // how many were left behind rather than silently losing them.
      if (!setName || !name) {
        skipped++;
        continue;
      }
      const types = fieldOf(props, /^type/i);
      rows.push({
        name,
        number: text(props.Number),
        set_name: setName,
        rarity: fieldOf(props, /rarit/i),
        gen: fieldOf(props, /^gen/i),
        types: types ? types.split(",").map((t) => t.trim()).filter(Boolean) : [],
        // A missing checkbox means owned. This is the single most important
        // line in the file: getting it the other way round turns the whole
        // binder into a wishlist.
        owned: props.Collection?.checkbox !== false,
        excluded: props.Excluded?.checkbox === true,
        acquired_at: p.created_time ?? null,
        source: "notion",
        source_id: p.id,
        user_id: userId,
      });
    }
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }

  return { rows, skipped };
}

const plural = (n, one, many) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

async function main() {
  process.stdout.write("Reading Notion… ");
  const { rows, skipped } = await notionRows();
  console.log(`${plural(rows.length, "row", "rows")}.`);

  // What the summary is for: every number below is one a person can check
  // against the database they have been keeping by hand for two years.
  const sets = new Set(rows.map((r) => r.set_name));
  const held = rows.filter((r) => r.owned).length;
  const excluded = rows.filter((r) => r.excluded).length;
  const undated = rows.filter((r) => !r.acquired_at).length;
  const dates = rows.map((r) => r.acquired_at).filter(Boolean).sort();

  const n = (x) => x.toLocaleString("en-GB");

  console.log(`
  ${plural(rows.length, "printing", "printings")} across ${plural(sets.size, "set", "sets")}
  ${n(held)} in the binder, ${n(rows.length - held)} on the wishlist
  ${n(excluded)} marked excluded
  ${dates.length ? `acquired between ${dates[0].slice(0, 10)} and ${dates.at(-1).slice(0, 10)}` : "no dates at all"}${undated ? `, ${n(undated)} with no date` : ""}${skipped ? `\n  ${plural(skipped, "row", "rows")} skipped for having no set or no name` : ""}
`);

  console.log("  A sample, to check the mapping is right:\n");
  for (const r of rows.slice(0, 5)) {
    console.log(
      `    ${r.set_name} ${r.number || "—"}  ${r.name}` +
        `  [${r.rarity ?? "no rarity"}]` +
        `  ${r.owned ? "held" : "wanted"}` +
        `  ${r.acquired_at?.slice(0, 10) ?? "undated"}`,
    );
  }

  if (!commit) {
    console.log(`
  Nothing was written. Check the numbers above against Notion, then:

    node scripts/import-notion.mjs --user ${userId} --commit
`);
    return;
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Counted before and after rather than from what the insert returns.
   *
   * The obvious version — `.select("id")` on the upsert and count the rows —
   * reports zero for a run that inserted sixteen hundred cards, because
   * ignoreDuplicates sends `Prefer: resolution=ignore-duplicates` and PostgREST
   * then hands back no representation at all. That is not a small cosmetic bug:
   * "0 cards added" after a successful import reads as a failed import, and the
   * next thing anybody does is run it again.
   */
  const countRows = async () => {
    const { count, error } = await db
      .from("cards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) die(`Could not count the collection: ${error.message}`);
    return count ?? 0;
  };

  const before = await countRows();
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    process.stdout.write(`\n  Writing ${i + 1}–${i + batch.length}… `);
    const { error } = await db
      .from("cards")
      .upsert(batch, { onConflict: "user_id,source,source_id", ignoreDuplicates: true });
    if (error) die(`\n  Postgres refused: ${error.message}`);
    process.stdout.write("ok");
  }
  const added = (await countRows()) - before;

  console.log(`

  ${plural(added, "card added", "cards added")}. ${(rows.length - added).toLocaleString("en-GB")} were already there.
  ${(await countRows()).toLocaleString("en-GB")} in the collection now.

  Notion is untouched and still authoritative. When the collection looks right,
  set COLLECTION_SOURCE=postgres; setting it back to notion is the rollback.
`);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
