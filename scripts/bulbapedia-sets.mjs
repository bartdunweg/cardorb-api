/**
 * Which Bulbapedia page and which list on it is each set in the copy.
 *
 * Bulbapedia files a set under its English name and its Japanese counterparts on the same page as
 * further lists ("Expansion Pack" on Base Set, "Blue Shock" and "Red Flash" on BREAKthrough), and a
 * subset as a list of its parent ("Galarian Gallery" on Crown Zenith). So a set is found by its
 * name: "<name> (TCG)" with redirects followed, the EX era's "EX <name> (TCG)", a subset's parent,
 * and then the list on that page whose title is the set's name. What that does not find is filled
 * by hand in the committed file, and a hand entry is never overwritten.
 *
 * Writes src/lib/core/catalogue/bulbapedia-sets.json: one entry per set, with `page` and the `lists` on
 * it that hold the set's cards (a set Bulbapedia splits, like Arceus and its AR and SH lists, names
 * each), or `page: null` and the reason it has none, which scripts/bulbapedia-compare.mjs reports as a set not
 * compared. The mapping is ours; nothing of Bulbapedia's text is in it beyond the titles.
 *
 * Read-only on the database (scripts/bulbapedia-wiki.mjs says how it is read). About twenty
 * requests to Bulbapedia, five seconds apart.
 *
 *   node scripts/bulbapedia-sets.mjs [--dry]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "prettier";
import {
  listRef,
  nameKey,
  parseInfobox,
  parseSetlists,
} from "../src/lib/core/catalogue/bulbapedia-setlist.mjs";
import { ROOT, ourSets, pageInfo, pageTexts } from "./bulbapedia-wiki.mjs";

const OUT = join(ROOT, "src", "lib", "core", "catalogue", "bulbapedia-sets.json");
const DRY = process.argv.includes("--dry");

/** The lists on a page that are cards of their own, not reprints of cards in another list. */
const ADDITIONAL = /^(additional cards|corrected error cards|error cards)$/i;

const key = (s) =>
  nameKey(
    String(s)
      .replace(/…/g, "...")
      .replace(/^pokémon card /i, ""),
  );

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const byHand = new Map(
  previous.filter((e) => e.how === "hand").map((e) => [`${e.language}/${e.id}`, e]),
);

const sets = await ourSets();

/** The names a set may go by on Bulbapedia, and the pages to look for it on. */
function candidates(set) {
  const names = [set.name, set.name.replace(/…/g, "...")];
  if (set.language === "en" && set.series === "EX") names.push(`EX ${set.name}`);
  const titles = names.map((n) => `${n} (TCG)`);
  // A subset: "Crown Zenith Galarian Gallery" is the Galarian Gallery list on Crown Zenith's page.
  const parent = sets
    .filter(
      (s) => s.language === set.language && s.id !== set.id && set.name.startsWith(`${s.name} `),
    )
    .sort((a, b) => b.name.length - a.name.length)[0];
  const lists = [...names];
  if (parent) {
    titles.push(`${parent.name} (TCG)`);
    if (parent.series === "EX") titles.push(`EX ${parent.name} (TCG)`);
    lists.push(set.name.slice(parent.name.length + 1));
  }
  return { titles: [...new Set(titles)], lists: [...new Set(lists)] };
}

const wanted = sets.filter((s) => !byHand.has(`${s.language}/${s.id}`));
const allTitles = wanted.flatMap((s) => candidates(s).titles);
const info = await pageInfo(allTitles);
const resolved = new Map([...info.values()].filter(Boolean).map((p) => [p.title, p]));
const { texts } = await pageTexts(resolved);

const parsed = new Map();
for (const [title, wikitext] of texts) {
  parsed.set(title, { lists: parseSetlists(wikitext), infobox: parseInfobox(wikitext) });
}

const entries = [];
for (const set of sets) {
  const hand = byHand.get(`${set.language}/${set.id}`);
  if (hand) {
    entries.push(hand);
    continue;
  }
  const base = { language: set.language, id: set.id, name: set.name };
  const { titles, lists } = candidates(set);
  const pages = [...new Set(titles.map((t) => info.get(t)?.title).filter(Boolean))];
  let found = null;
  for (const page of pages) {
    if (found?.page) break;
    const own =
      parsed.get(page)?.lists.filter((l) => !ADDITIONAL.test(l.title) && l.entries.length) ?? [];
    const named = own.filter((l) => lists.some((n) => key(n) === key(l.title)));
    // A Japanese set is the page's last list by its name: "Forbidden Light" is the title of the
    // English list and of the Japanese one after it. Where the only list by that name is the
    // English set's own, first on a page with more, it is not the Japanese set's.
    const list = set.language === "ja" ? named.at(-1) : named[0];
    if (list && set.language === "ja" && list === own[0] && own.length > 1) {
      found = {
        page: null,
        lists: [],
        reason: `"${page}" names only its English list "${list.title}"`,
      };
      continue;
    }
    if (list) {
      found = { page, lists: [listRef(parsed.get(page).lists, list)], how: "name" };
      break;
    }
  }
  if (!found?.page && !found?.reason && pages.length) {
    // The set's own title led to a page whose lists all have other names: one list of cards left
    // for it (the English set's page, for an English set; the one Japanese list, for a Japanese one).
    const page = pages[0];
    const own =
      parsed.get(page)?.lists.filter((l) => !ADDITIONAL.test(l.title) && l.entries.length) ?? [];
    const pick = set.language === "en" ? own.slice(0, 1) : own.slice(1);
    const infoboxName = parsed.get(page)?.infobox.setname;
    if (
      set.language === "en" &&
      pick.length === 1 &&
      infoboxName &&
      key(infoboxName) === key(set.name)
    ) {
      found = { page, lists: [listRef(parsed.get(page).lists, pick[0])], how: "only list" };
    } else if (set.language === "ja" && pick.length === 1) {
      found = { page, lists: [listRef(parsed.get(page).lists, pick[0])], how: "only list" };
    } else {
      found = {
        page: null,
        lists: [],
        reason: `"${page}" has no list named for it (lists: ${own.map((l) => l.title).join(", ") || "none"})`,
      };
    }
  }
  entries.push({
    ...base,
    ...(found ?? {
      page: null,
      lists: [],
      reason: `no page at ${titles.map((t) => `"${t}"`).join(" or ")}`,
    }),
  });
}

const mapped = entries.filter((e) => e.page);
for (const language of ["en", "ja"]) {
  const all = entries.filter((e) => e.language === language);
  console.log(`${language}: ${all.filter((e) => e.page).length} of ${all.length} mapped`);
}
for (const e of entries.filter((e) => !e.page))
  console.log(`  unmapped ${e.language}/${e.id} (${e.name}): ${e.reason}`);
if (!DRY) {
  // Bulbapedia's titles use typographic dashes; escaped so the file holds none as a character.
  const json = (await format(JSON.stringify(entries), { parser: "json" })).replace(
    /[\u2013\u2014]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16)}`,
  );
  writeFileSync(OUT, json);
  console.log(`Wrote ${mapped.length} of ${entries.length} to ${OUT}`);
}
