/**
 * Every row in the collection, held against what the catalogue says, with the
 * correction worked out where it can be.
 *
 *   npx tsx scripts/audit-collection.mjs --user <uuid>           # dry run: reports, writes nothing
 *   npx tsx scripts/audit-collection.mjs --user <uuid> --write   # the same, and applies the safe fixes
 *
 * Run with Node 22+ (this repo's floor — @supabase/supabase-js needs a native
 * WebSocket that Node 20 does not have).
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * docs/trainer-gallery-row-corrections.md is a worklist of 23 Trainer Gallery
 * rows filed under a number that belongs to a different card, worked out by
 * hand. docs/rarity-type-backfill-corrections.md is a second worklist of the
 * same shape, from scripts/backfill-rarity-types.mjs. Both exist because the
 * app already *knows* which rows do not line up — buildCollection() refuses
 * them a scan on exactly that basis — and then throws the knowledge away.
 *
 * Asked for directly: "ik heb misschien foutjes in mn collectie en die moeten
 * van api's enzo". So this is the general form of both worklists. It finds
 * every row the catalogue disagrees with, and — the part the worklists needed a
 * human for — looks the card up *by name within its own set* to work out what
 * the number should have been.
 *
 * Which means the 23 gallery rows are not a special case here. They are class B
 * below, and they fall out of the same walk as everything else.
 *
 * ── The three classes ──────────────────────────────────────────────────────
 *
 * **A. The name does not match the catalogue's.** The number matched and
 *    sameCard() agreed, so this is definitely the same card and only the way it
 *    is written moves. Two kinds: a typo ("Tyrantirar" for Tyranitar — twenty-two
 *    of those are in here, see lib/core/matching.ts, which was widened to
 *    tolerate them rather than lose their artwork), and a missing card-type
 *    suffix, where the row says "Pikachu" and the card says "Pikachu ex". Both
 *    are corrected to exactly what the catalogue says: "Als TCGdex 'Pikachu X'
 *    zegt, dan moeten wij dat ook zeggen."
 *
 * **B. The number is wrong.** The number resolves to a different card, but this
 *    card does exist in this set under another number. Fixed only when exactly
 *    one card in the set carries the name — several Blazikens (Blaziken V,
 *    Blaziken VMAX) means a human has to say which one is in the binder, and a
 *    coin flip here writes a confidently wrong row.
 *
 * **C. Neither.** The catalogue has nothing in this set by this name at any
 *    number. Could be a set too new to be indexed, a name that is wrong in a way
 *    sameCard() cannot bridge, or a genuinely unlisted card. Never guessed at —
 *    written to a worklist for a human, the same shape as the two it replaces.
 *
 * Nothing is written without --write, and nothing ambiguous is written at all.
 *
 * ── Why TCGdex ─────────────────────────────────────────────────────────────
 *
 * Because it is what buildCollection() matches against, so an audit that used
 * a different catalogue would "fix" rows into disagreeing with the app that
 * reads them. It is also free and unmetered, which the alternative is not
 * (ADR-0039). The matching pieces are imported from lib/core rather than
 * copied, so this stays the one implementation.
 *
 * Deliberately not routed through setCatalogue(): that wraps the same walk in
 * unstable_cache, which needs a Next.js request context and throws from a bare
 * script. Same reasoning, and the same three imports, as
 * scripts/backfill-rarity-types.mjs.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveSetIds } from "../src/lib/core/catalogue.ts";
import { fetchSet, json } from "../src/lib/core/tcgdex-client.ts";
import { numberForms, mapLimit, norm } from "../src/lib/core/util.ts";
import { sameCard } from "../src/lib/core/matching.ts";

/* The card-type suffix, the same list matching.ts strips before comparing two
   names. Module scope because both halves of this script need it: the name
   index tolerates it, and the misspelling check has to ignore it.
   Separated by a hyphen as well as a space, unlike matching.ts's copy, because
   the older sets write it that way — "Yveltal-EX", not "Yveltal EX" — and
   without that this reports a house-style difference as a typo and then
   "corrects" the row into carrying the suffix after all. */
const TYPE_SUFFIX = /[\s-]+(ex|gx|v|vmax|vstar|v-union|prime|legend|break|lv\.?\s?x|star|δ)$/i;

const ROOT = new URL("..", import.meta.url).pathname;
const WORKLIST = `${ROOT}docs/collection-audit-corrections.md`;

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
  console.error("\n  --user <uuid> is required — whose rows to audit.\n");
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
 * Two indexes over one set: by number, the way loadSetCatalogue() builds it,
 * and by name, which is the one this script needs and the app never has.
 *
 * byName is what turns "this row is wrong" into "this row should say TG04".
 * Keyed on the name with its card-type suffix left on, and a second key with it
 * stripped, so a row filed as "Blaziken" can find "Blaziken V" — that is the
 * same tolerance sameCard() applies, and the reason the result has to be
 * checked for ambiguity before it is believed.
 */
async function indexSet(setName, setsIndex) {
  const ids = setsIndex.length ? resolveSetIds(setName, setsIndex) : [];
  const details = (await mapLimit(ids, 1, fetchSet)).filter(Boolean);
  const cards = details.flatMap((d) => d.cards ?? []).filter((c) => c.localId && c.name);

  const byNumber = {};
  const put = (form, card) => {
    const k = form.toLowerCase();
    if (k in byNumber) return;
    byNumber[k] = { id: card.id, localId: card.localId, name: card.name };
  };
  for (const card of cards) for (const form of numberForms(card.localId)) put(form, card);
  // Second pass on the numeric tail of a prefixed id ("XY74" -> "74"), after
  // the exact forms and never overwriting them. Same order, same reason, as
  // loadSetCatalogue().
  for (const card of cards) {
    const tail = card.localId.match(/^[A-Za-z]+(\d+[A-Za-z]?)$/)?.[1];
    if (!tail) continue;
    for (const form of numberForms(tail)) put(form, card);
  }

  const byName = new Map();
  const add = (key, card) => {
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    const bucket = byName.get(key);
    if (!bucket.some((c) => c.localId === card.localId)) bucket.push(card);
  };
  for (const card of cards) {
    const entry = { id: card.id, localId: card.localId, name: card.name };
    add(norm(card.name), entry);
    add(norm(card.name.replace(TYPE_SUFFIX, "")), entry);
  }

  return { byNumber, byName, size: cards.length };
}

/**
 * Every row, paged, because PostgREST caps a response at 1000 and says nothing
 * about it.
 *
 * The first version of this script did a bare `.select()` and reported "1000
 * rows" for a collection of 1,968 — half of it silently absent from an audit
 * whose entire job is completeness. lib/storage/postgres.ts already carries
 * this loop and an explicit "throw if we got fewer than the count said" for the
 * same reason; a script that skipped it was going to give a clean bill of health
 * to rows it had never looked at.
 */
async function allRows(db) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await db
      .from("cards")
      .select("id,set_name,number,name,owned", { count: "exact" })
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Postgres query: ${error.message}`);
    out.push(...data);
    if (out.length >= (count ?? 0) || !data.length) {
      if (out.length < (count ?? 0)) {
        throw new Error(
          `Postgres returned ${out.length} of ${count} rows — refusing to audit a partial collection`,
        );
      }
      return out;
    }
  }
}

const db = serviceClient();
const rows = await allRows(db);
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
  if (!row.set_name || !row.name) continue;
  if (!bySet.has(row.set_name)) bySet.set(row.set_name, []);
  bySet.get(row.set_name).push(row);
}

/** A: spelling. B: number, one candidate. Ambiguous: number, several. C: nothing. */
const misspelled = [];
const misnumbered = [];
const ambiguous = [];
const unresolved = [];
let fine = 0;

console.log(`Resolving ${bySet.size} sets against TCGdex…`);
// Three at a time, the same limit lib/core/cards.ts's own set walk uses: TCGdex
// starts refusing well before every set is in flight at once.
await mapLimit([...bySet.entries()], 3, async ([setName, setRows]) => {
  const { byNumber, byName, size } = await indexSet(setName, setsIndex);
  if (!size) {
    // A set the catalogue does not have at all is not 40 broken rows, it is one
    // unknown set. Reported as such rather than flooding the worklist.
    for (const row of setRows) unresolved.push({ row, why: "TCGdex has no cards for this set" });
    return;
  }

  for (const row of setRows) {
    const at = numberForms(row.number)
      .map((form) => byNumber[form.toLowerCase()])
      .find(Boolean);

    if (at?.name && sameCard(at.name, row.name)) {
      /**
       * The number is right, so the name is the only thing left that can be
       * wrong — and the catalogue's name wins outright, suffix included.
       *
       * This was the other way round for one run of this script. The collection
       * had years of "Pikachu" where TCGdex says "Pikachu ex", so the first
       * version read the suffix as house style and compared with it stripped,
       * which left 179 rows alone. Bart's call: "Als TCGdex 'Pikachu X' zegt,
       * dan moeten wij dat ook zeggen." Which is only ADR-0040's own principle
       * applied without an exception carved out of it — a card's name is a fact
       * about the card, and the catalogue owns those.
       *
       * It also makes the old rows match the new ones. Nothing hand-types a
       * name any more: the add dialog writes whatever the catalogue match said
       * (ADR-0030, ADR-0032), suffix and all. So the 179 were not a convention
       * being kept, they were rows predating the rule.
       *
       * Checked before running rather than after: speciesOf() finds a Pokémon
       * by substring, longest first, so "pikachuex" still resolves to Pikachu
       * and "mewtwoex" to Mewtwo rather than Mew. Twelve suffixed names,
       * including the & GX pairs and the hyphenated -EX, all keep their Pokédex
       * place. sameCard() strips the suffix from both sides, so matching is
       * unaffected either way.
       */
      if (norm(at.name) !== norm(row.name)) {
        misspelled.push({ row, to: at.name, localId: at.localId });
      } else fine++;
      continue;
    }

    /**
     * The number is right and the words are right; only their order is wrong.
     *
     * Two real rows: "Urshifu Single Strike" at TG18, where the card is called
     * "Single Strike Urshifu V", and the same for Rapid Strike at TG20.
     * sameCard() refuses them and should — it tolerates two typos but will not
     * reorder words, because reordering is how Mew would start matching Mewtwo.
     *
     * But this is a narrower claim than sameCard() is being asked for. The
     * number already resolved to this card, inside the set the row itself
     * names, and the two names are the same multiset of words. That is not a
     * guess about which card it is; it is the observation that the row and the
     * catalogue are describing one card in a different order.
     */
    const bag = (s) => norm(s.replace(TYPE_SUFFIX, "")).split("").sort().join("");
    const words = (s) =>
      s
        .replace(TYPE_SUFFIX, "")
        .toLowerCase()
        .split(/\s+/)
        .map(norm)
        .filter(Boolean)
        .sort()
        .join("|");
    if (at?.name && words(at.name) === words(row.name) && bag(at.name) === bag(row.name)) {
      misspelled.push({ row, to: at.name, localId: at.localId });
      continue;
    }

    const candidates =
      byName.get(norm(row.name)) ?? byName.get(norm(row.name.replace(TYPE_SUFFIX, ""))) ?? [];

    /**
     * Narrowed to candidates numbered the same *shape* as the row already is.
     *
     * A gallery card is filed as TG08 and a main-run card as 062, and a row
     * that is at TG08 is a gallery card whatever else is wrong with it — the
     * prefix is the one part of a wrong number that is still reliable, because
     * it says which run of the set the card came out of rather than where in
     * that run it sits.
     *
     * Without this, "Jynx at #TG08" reads as a coin flip between #062 Jynx and
     * #TG04 Jynx and goes to a human. With it, it is #TG04 — which is exactly
     * what the hand-written worklist concluded for the same row. It resolves
     * ten of the twenty-two and leaves the ones that genuinely need a person:
     * a Blaziken at TG12 really could be TG14 Blaziken V or TG15 Blaziken
     * VMAX, and only the card in your hands says which.
     *
     * Applied only when it narrows to exactly one. Narrowing to none means the
     * assumption does not hold for this row, so the unfiltered list is what
     * gets reported rather than a smaller wrong answer.
     */
    const prefixOf = (n) =>
      (
        String(n)
          .trim()
          .match(/^[A-Za-z]+/)?.[0] ?? ""
      ).toUpperCase();
    const sameRun = candidates.filter((c) => prefixOf(c.localId) === prefixOf(row.number));
    const narrowed = sameRun.length === 1 ? sameRun : candidates;

    if (narrowed.length === 1) {
      misnumbered.push({ row, to: narrowed[0], at: at?.name ?? null });
    } else if (narrowed.length > 1) {
      ambiguous.push({ row, candidates: narrowed, at: at?.name ?? null });
    } else {
      unresolved.push({
        row,
        why: at?.name
          ? `#${row.number} is ${at.name}, and no ${row.name} in this set`
          : "no such number and no such name in this set",
      });
    }
  }
});

const n = (list) => String(list.length).padStart(4);
console.log(`
  ${n([...Array(fine)])} rows already agree with TCGdex
  ${n(misspelled)} rows have the right number, a misspelled name   (A — safe to fix)
  ${n(misnumbered)} rows have the wrong number, one candidate       (B — safe to fix)
  ${n(ambiguous)} rows have the wrong number, several candidates  (needs a human)
  ${n(unresolved)} rows the catalogue cannot place at all         (needs a human)
`);

for (const { row, to } of misspelled) {
  console.log(
    `  A  ${row.set_name} #${row.number} ${JSON.stringify(row.name)} -> ${JSON.stringify(to)}`,
  );
}
for (const { row, to, at } of misnumbered) {
  console.log(
    `  B  ${row.set_name} ${row.name}: #${row.number} -> #${to.localId}` +
      (at ? `  (#${row.number} is really ${at})` : ""),
  );
}
for (const { row, candidates } of ambiguous) {
  console.log(
    `  ?  ${row.set_name} ${row.name} at #${row.number}: could be ` +
      candidates.map((c) => `#${c.localId} ${c.name}`).join(" or "),
  );
}

/* The two classes a script must not decide, written out in the same shape as
   the worklists this replaces — a file to work through by hand and delete once
   it is empty. */
if (ambiguous.length || unresolved.length) {
  const lines = [
    "# Collection rows the audit could not fix on its own",
    "",
    "Generated by `scripts/audit-collection.mjs`. A worklist, not a decision.",
    "Delete this file once it is empty.",
    "",
    "## Several cards in the set carry this name",
    "",
    "The row is at the wrong number and the catalogue has more than one card it",
    "could be — usually a card and its V/VMAX. Only the card in your hands says",
    "which, so the script refuses to guess.",
    "",
    "| set | name | filed at | could be |",
    "| --- | --- | --- | --- |",
    ...ambiguous.map(
      ({ row, candidates }) =>
        `| ${row.set_name} | ${row.name} | \`${row.number}\` | ` +
        candidates.map((c) => `\`${c.localId}\` ${c.name}`).join(" or ") +
        " |",
    ),
    "",
    "## The catalogue cannot place these at all",
    "",
    "A set too new to be indexed, a name wrong in a way `sameCard()` cannot",
    "bridge, or a genuinely unlisted card.",
    "",
    "| set | name | filed at | why |",
    "| --- | --- | --- | --- |",
    ...unresolved.map(
      ({ row, why }) => `| ${row.set_name} | ${row.name} | \`${row.number}\` | ${why} |`,
    ),
    "",
  ];
  writeFileSync(WORKLIST, lines.join("\n"));
  console.log(
    `\n  ${ambiguous.length + unresolved.length} rows written to docs/collection-audit-corrections.md`,
  );
}

if (!WRITE) {
  console.log(
    `\n  Dry run — nothing written. Pass --write to apply the ${misspelled.length + misnumbered.length} safe fixes.\n`,
  );
  process.exit(0);
}

/**
 * What every row said before, written to disk *before* anything is updated.
 *
 * This is a script that edits a hand-kept collection somebody has been adding
 * to for years, against a catalogue that is right almost always rather than
 * always. "Almost always" is exactly the case that needs an undo — and the
 * information to build one only exists in this process, for these few seconds,
 * because the old value is about to stop being anywhere.
 *
 * Written first, so a crash halfway through leaves a complete record of what
 * was intended rather than a partial one of what happened. Restoring is a
 * `update({name, number}) where id` per line; the file is JSON so that is a
 * two-line script rather than a parsing job.
 */
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const journal = `${ROOT}docs/collection-audit-${stamp}.undo.json`;
writeFileSync(
  journal,
  JSON.stringify(
    [
      ...misspelled.map(({ row, to }) => ({
        id: row.id,
        set: row.set_name,
        field: "name",
        from: row.name,
        to,
      })),
      ...misnumbered.map(({ row, to }) => ({
        id: row.id,
        set: row.set_name,
        name: row.name,
        field: "number",
        from: row.number,
        to: to.localId,
      })),
    ],
    null,
    2,
  ),
);
console.log(`\n  Undo journal: ${journal.replace(ROOT, "")}`);

let written = 0;
for (const { row, to } of misspelled) {
  const { error } = await db.from("cards").update({ name: to }).eq("id", row.id);
  if (error) console.error(`  failed to write ${row.id}: ${error.message}`);
  else written++;
}
for (const { row, to } of misnumbered) {
  const { error } = await db.from("cards").update({ number: to.localId }).eq("id", row.id);
  if (error) console.error(`  failed to write ${row.id}: ${error.message}`);
  else written++;
}
console.log(`  ${written} rows updated.`);
console.log(
  `  Run again to confirm they now agree, and open /collection to see the artwork fill in.\n`,
);
