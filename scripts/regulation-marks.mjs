/**
 * The regulation mark of every English card TCGdex gives none, read off Bulbapedia's set lists, into
 * src/lib/core/catalogue/regulation-marks.generated.json. The nightly copy fills a card's empty mark
 * from it (mirror.ts), and data-health.mjs fails on a card of a newer set that still has none.
 *
 * TCGdex fills a set's marks in its own time: 30th Celebration came out on 2026-09-16 with none on
 * 155 of its 158 cards, where the cards print J. TCGplayer names no mark; pokemontcg.io's data has
 * them, and its README asks not to use it as a primary source, so it is read here only to report
 * where it disagrees. Bulbapedia's list gives each card's mark in its symbol column, and "-" for a
 * card that prints none (a Classic Collection reprint), which is written as null.
 *
 * Bulbapedia refuses GitHub's runners, so this runs on a person's machine and the file is committed.
 * Read-only on the database; Bulbapedia is asked as scripts/bulbapedia-wiki.mjs asks it (five seconds
 * apart, cached by revision). Only a mark is kept, never Bulbapedia's text.
 *
 *   SUPABASE_CLI=… SUPABASE_WORKDIR=… node scripts/regulation-marks.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  findList,
  nameKey,
  numberKey,
  parseSetlists,
} from "../src/lib/core/catalogue/bulbapedia-setlist.mjs";
import { ROOT, pageInfo, pageTexts, query } from "./bulbapedia-wiki.mjs";

const CATALOGUE = join(ROOT, "src", "lib", "core", "catalogue");
const OUT = join(CATALOGUE, "regulation-marks.generated.json");
const DRY = process.argv.includes("--dry");

/** The series whose cards print a regulation mark: Sword & Shield on (TCGdex serie ids). */
const MARKED_SERIES = ["swsh", "sv", "me"];

const read = (file) => JSON.parse(readFileSync(join(CATALOGUE, file), "utf8"));
const mapping = read("bulbapedia-sets.json");
const printed = read("classic-collection-numbers.generated.json");
const ptcgIds = read("ptcg-set-ids.json");
const previous = (() => {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return {};
  }
})();

const cards = await query(
  `select c.id, c.set_id, c.local_id, c.name, c.regulation_mark from catalogue_cards c join catalogue_sets s on s.language = c.language and s.id = c.set_id where c.language = 'en' and s.serie_id in (${MARKED_SERIES.map((s) => `'${s}'`).join(", ")}) and (c.regulation_mark is null or c.id in (${
    Object.keys(previous)
      .map((id) => `'${id.replaceAll("'", "''")}'`)
      .join(", ") || "''"
  }))`,
);
const bySet = new Map();
for (const c of cards) bySet.set(c.set_id, [...(bySet.get(c.set_id) ?? []), c]);
console.error(`${cards.length} cards in ${bySet.size} sets without a mark from TCGdex`);

const wanted = [...bySet.keys()]
  .map((id) => mapping.find((m) => m.language === "en" && m.id === id))
  .filter((m) => m?.page);
const info = await pageInfo(wanted.map((m) => m.page));
const { texts } = await pageTexts(new Map([...info].filter(([, p]) => p)));

/** "4/102" and BP's number "4" of 102 meet; a plain number meets on its digits. */
const keyOf = (number, total) => `${numberKey(number)}${total ? `/${numberKey(total)}` : ""}`;

const out = {};
const unmapped = [];
for (const [setId, rows] of [...bySet].sort(([a], [b]) => a.localeCompare(b))) {
  const map = mapping.find((m) => m.language === "en" && m.id === setId);
  const text = map?.page ? texts.get(info.get(map.page)?.title ?? "") : null;
  if (!text) {
    unmapped.push(`${setId} (${map?.reason ?? "no Bulbapedia page"})`);
    continue;
  }
  const lists = parseSetlists(text);
  const entries = map.lists.flatMap((ref) => findList(lists, ref)?.entries ?? []);
  const withTotal = new Map();
  const plain = new Map();
  /* A promo Bulbapedia numbers "None" (MEP's Pikachu at the Museum) is found by its name. */
  const unnumbered = new Map();
  for (const e of entries) {
    if ("mark" in e && !e.number) unnumbered.set(nameKey(e.name), e.mark);
    if (!("mark" in e) || !e.number) continue;
    withTotal.set(keyOf(e.number, e.printedTotal), e.mark);
    if (!plain.has(numberKey(e.number))) plain.set(numberKey(e.number), e.mark);
    else if (plain.get(numberKey(e.number)) !== e.mark) plain.set(numberKey(e.number), undefined);
  }
  for (const c of rows) {
    const [n, total] = (printed[c.id] ?? "").split("/");
    const mark = printed[c.id]
      ? withTotal.get(keyOf(n, total))
      : plain.has(numberKey(c.local_id)) || /\d/.test(c.local_id)
        ? plain.get(numberKey(c.local_id))
        : unnumbered.get(nameKey(c.name));
    if (mark !== undefined) out[c.id] = mark;
  }
}

/* pokemontcg.io's data, only to say where it disagrees (its README: not a primary source). */
const toPtcg = new Map(Object.entries(ptcgIds).map(([ptcg, tcgdex]) => [tcgdex, ptcg]));
let compared = 0;
const disagree = [];
for (const setId of new Set(Object.keys(out).map((id) => cards.find((c) => c.id === id)?.set_id))) {
  const ptcg = toPtcg.get(setId) ?? setId;
  const res = await fetch(
    `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${ptcg}.json`,
  ).catch(() => null);
  if (!res?.ok) continue;
  const theirs = new Map(
    (await res.json()).map((c) => [numberKey(c.number), c.regulationMark ?? null]),
  );
  for (const c of cards.filter((x) => x.set_id === setId && x.id in out)) {
    const [n] = (printed[c.id] ?? "").split("/");
    const key = printed[c.id] ? numberKey(n) : numberKey(c.local_id);
    if (!theirs.has(key) || printed[c.id]) continue;
    compared++;
    if (theirs.get(key) !== out[c.id]) disagree.push(`${c.id} ${out[c.id]} vs ${theirs.get(key)}`);
  }
}

const marked = Object.values(out).filter(Boolean).length;
console.error(
  `Bulbapedia: ${Object.keys(out).length} cards read, ${marked} with a mark, ${Object.keys(out).length - marked} printing none; ${cards.length - Object.keys(out).length} not found`,
);
console.error(`not on Bulbapedia's lists: ${unmapped.join("; ") || "none"}`);
console.error(
  `pokemontcg.io disagrees on ${disagree.length} of ${compared}${disagree.length ? `: ${disagree.slice(0, 10).join(", ")}` : ""}`,
);
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
if (!DRY) writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
