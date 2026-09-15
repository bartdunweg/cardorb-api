/**
 * The copy's set names, set sizes, card numbers and card names beside Bulbapedia's, and every place
 * they differ.
 *
 * Bart, 2026-09-14: naming is the foundation. Every name and number the app shows comes out of our
 * own catalogue copy, filled from TCGdex and TCGplayer at night, and neither is right about
 * everything (Bulbapedia is not either). This puts each set beside Bulbapedia's list of it, using
 * the committed mapping in src/lib/core/catalogue/bulbapedia-sets.json, and reports what differs.
 * It changes no data: a difference is for a person to look at, and one that has been looked at and
 * is kept on purpose goes into src/lib/core/catalogue/bulbapedia-accepted.json with its reason.
 *
 * Read-only on the database; Bulbapedia is asked for each page's revision, and for the text of the
 * pages edited since the cached copy (scripts/bulbapedia-wiki.mjs). Writes the whole report to
 * stdout as Markdown, and to --issue <file> a copy short enough for a GitHub issue body. Exits 1
 * where a difference is not accepted, 2 where the check itself failed.
 *
 *   node scripts/bulbapedia-compare.mjs [--set en/base1] [--issue issue.md] [--run-url <url>]
 *   node scripts/bulbapedia-compare.mjs --copy <dir>
 *
 * --copy reads the copy from <dir>/sets.json and <dir>/cards.json (rows of catalogue_sets and
 * catalogue_cards) instead of the database: the copy as a change to its rules will write it, for a
 * report on that change before a night has run it.
 *
 * Run by hand, from a machine Bulbapedia answers: it refuses GitHub's runners with a 403 (first
 * scheduled run, 2026-09-14), so there is no workflow. Bart chose to run it on request.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  KINDS,
  compareSet,
  isAccepted,
  listedEntries,
} from "../src/lib/core/catalogue/bulbapedia-compare.mjs";
import {
  findList,
  parseInfobox,
  parseSetlists,
} from "../src/lib/core/catalogue/bulbapedia-setlist.mjs";
import { ROOT, ourSets, pageInfo, pageTexts, query, requestCount } from "./bulbapedia-wiki.mjs";

const CATALOGUE = join(ROOT, "src", "lib", "core", "catalogue");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const ONLY = arg("--set");
const COPY = arg("--copy");
const ISSUE = arg("--issue");
const RUN_URL = arg("--run-url");
/**
 * Lists of cards from many sets, each card naming its own set in italics: a set's cards on one of
 * these are compared with that set, where its own list does not hold them. Yellow A Alternate cards
 * are the lettered reprints (Blacksmith 88a of Flashfire) the copy files under the set they print.
 */
const ALTERNATE_LISTS = [
  { page: "Yellow A Alternate cards (TCG)", list: "Yellow A Alternate cards" },
];
/** GitHub refuses an issue body over 65,536 characters. */
const ISSUE_LIMIT = 60_000;

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(2);
}

async function main() {
  const mapping = JSON.parse(readFileSync(join(CATALOGUE, "bulbapedia-sets.json"), "utf8"));
  const accepted = JSON.parse(readFileSync(join(CATALOGUE, "bulbapedia-accepted.json"), "utf8"));
  const today = new Date().toISOString().slice(0, 10);

  const copied = (file) => JSON.parse(readFileSync(join(COPY, file), "utf8"));
  const sets = new Map(
    (COPY ? copied("sets.json") : await ourSets()).map((s) => [`${s.language}/${s.id}`, s]),
  );
  const cards = new Map();
  for (const language of ["en", "ja"]) {
    const rows = COPY
      ? copied("cards.json").filter((r) => r.language === language)
      : await query(
          `select set_id, id, local_id, name from catalogue_cards where language = '${language}'`,
        );
    for (const r of rows) {
      const k = `${language}/${r.set_id}`;
      if (!cards.has(k)) cards.set(k, []);
      cards.get(k).push(r);
    }
  }

  const wanted = mapping.filter((m) => !ONLY || `${m.language}/${m.id}` === ONLY);
  const titles = [
    ...new Set([
      ...wanted.filter((m) => m.page).map((m) => m.page),
      ...ALTERNATE_LISTS.map((a) => a.page),
    ]),
  ];
  const info = await pageInfo(titles);
  const resolved = new Map([...info.values()].filter(Boolean).map((p) => [p.title, p]));
  const { texts, fetched } = await pageTexts(resolved);
  const pages = new Map();
  for (const [title, wikitext] of texts)
    pages.set(title, { lists: parseSetlists(wikitext), infobox: parseInfobox(wikitext) });

  // Each alternate by the English list title of the set it names ("Flashfire").
  const alternatesOf = new Map();
  for (const a of ALTERNATE_LISTS) {
    const target = info.get(a.page);
    const list = target ? pages.get(target.title)?.lists.find((l) => l.title === a.list) : null;
    for (const e of list?.entries ?? []) {
      if (!e.from) continue;
      if (!alternatesOf.has(e.from)) alternatesOf.set(e.from, []);
      alternatesOf.get(e.from).push(e);
    }
  }

  /** @type {{ key: string, set: any, map: any, status: string, differences: any[], ours: number, theirs: number }[]} */
  const results = [];
  const notCompared = [];
  for (const map of wanted) {
    const key = `${map.language}/${map.id}`;
    const set = sets.get(key);
    if (!set) continue; // a mapping for a set the copy no longer holds
    if (!map.page) {
      notCompared.push({ key, name: set.name, reason: map.reason });
      continue;
    }
    const target = info.get(map.page);
    const page = target ? pages.get(target.title) : null;
    const found = page ? map.lists.map((ref) => findList(page.lists, ref)) : [];
    const listed = {
      lists: map.lists,
      found,
      alternates:
        map.language === "en" ? map.lists.flatMap((ref) => alternatesOf.get(ref) ?? []) : [],
      jasetname: page?.infobox.jasetname ?? null,
    };
    const differences = page
      ? compareSet(set, cards.get(key) ?? [], listed)
      : [
          {
            kind: "list not found",
            language: map.language,
            set: map.id,
            ours: set.name,
            bulbapedia: `no page "${map.page}"`,
          },
        ];
    for (const d of differences) d.accepted = isAccepted(d, accepted);
    const open = differences.filter((d) => !d.accepted);
    const ours = (cards.get(key) ?? []).length;
    const theirs = listedEntries(listed).length;
    const status = !open.length
      ? "clean"
      : open.some((d) => d.kind === "list not found")
        ? "not found"
        : ours < theirs
          ? `short of ${theirs - ours}`
          : ours > theirs
            ? `${ours - theirs} more`
            : "names differ";
    results.push({ key, set, map, status, differences, ours, theirs });
  }

  const all = results.flatMap((r) => r.differences);
  const open = all.filter((d) => !d.accepted);
  const stale = accepted.filter((a) => !all.some((d) => isAccepted(d, [a])));

  const lines = [];
  const out = (s = "") => lines.push(s);
  const cell = (s) =>
    String(s ?? "")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ") || " ";

  out(
    `## Naming differences, ${today}: ${open.length ? `${open.length} not accepted` : "none not accepted"}`,
  );
  out();
  out(
    `${results.length} sets compared with Bulbapedia across ${resolved.size} pages (${fetched} fetched this run, ${requestCount} requests); ${all.length - open.length} differences accepted in \`bulbapedia-accepted.json\`.`,
  );
  out();
  out(
    "| Language | Sets compared | Clean | Short of cards | Card name mismatches | Name spellings |",
  );
  out("|---|---|---|---|---|---|");
  for (const language of ["en", "ja"]) {
    const rs = results.filter((r) => r.set.language === language);
    const os = open.filter((d) => d.language === language);
    out(
      `| ${language} | ${rs.length} | ${rs.filter((r) => r.status === "clean").length} | ${rs.filter((r) => r.ours < r.theirs).length} | ${os.filter((d) => d.kind === "card name").length} | ${os.filter((d) => d.kind === "card name spelling").length} |`,
    );
  }
  out();
  out("| Kind | Not accepted | Accepted |");
  out("|---|---|---|");
  for (const kind of KINDS) {
    const n = all.filter((d) => d.kind === kind);
    if (n.length)
      out(
        `| ${kind} | ${n.filter((d) => !d.accepted).length} | ${n.filter((d) => d.accepted).length} |`,
      );
  }
  out();

  if (notCompared.length) {
    out(`### Sets not compared (${notCompared.length})`);
    out();
    for (const s of notCompared) out(`- \`${s.key}\` ${s.name}: ${s.reason}`);
    out();
  }
  if (stale.length) {
    out(`### Accepted differences no longer seen (${stale.length})`);
    out();
    for (const a of stale)
      out(
        `- \`${a.language}/${a.set}\` ${a.kind} ${a.number ?? ""}: "${a.ours}" / "${a.bulbapedia}"`,
      );
    out();
  }

  const summaryEnd = lines.length;

  out("### Sets with differences");
  out();
  out("| Set | Ours | Bulbapedia | Cards (ours / theirs) | Status | Open |");
  out("|---|---|---|---|---|---|");
  for (const r of results.filter((r) => r.status !== "clean"))
    out(
      `| \`${r.key}\` | ${cell(r.set.name)} | ${cell(`${r.map.page}: ${r.map.lists.join(" + ")}`)} | ${r.ours} / ${r.theirs} | ${r.status} | ${r.differences.filter((d) => !d.accepted).length} |`,
    );
  out();
  const clean = results.filter((r) => r.status === "clean");
  out(`<details><summary>Clean sets (${clean.length})</summary>`);
  out();
  out(clean.map((r) => `\`${r.key}\``).join(", ") || "none");
  out();
  out("</details>");
  out();

  out("### Differences by kind");
  for (const kind of KINDS) {
    const ds = open.filter((d) => d.kind === kind);
    if (!ds.length) continue;
    out();
    out(`#### ${kind} (${ds.length})`);
    out();
    out("| Set | Card | Ours | Bulbapedia |");
    out("|---|---|---|---|");
    for (const d of ds)
      out(
        `| \`${d.language}/${d.set}\` | ${d.card ? `\`${d.card}\`` : cell(d.number)} | ${cell(d.ours)} | ${cell(d.bulbapedia)} |`,
      );
  }
  out();
  const footer = `Names and numbers under "Bulbapedia" are from [Bulbapedia](https://bulbapedia.bulbagarden.net) set pages (CC BY-NC-SA 2.5), read ${today}. Card names printed in Japanese are not compared: Bulbapedia holds them on each card's own page, one request per card. A difference kept on purpose goes into \`src/lib/core/catalogue/bulbapedia-accepted.json\` with its reason.`;
  out(footer);

  const report = lines.join("\n");
  console.log(report);

  if (ISSUE) {
    let body = report;
    if (body.length > ISSUE_LIMIT) {
      // The summary whole, then as much of the detail as fits, cut at a line.
      const head = lines.slice(0, summaryEnd).join("\n");
      const note = `\n\n_The report is ${report.length.toLocaleString("en")} characters, more than an issue holds; the rest is in the run's summary and its report artifact${RUN_URL ? ` (${RUN_URL})` : ""}._\n\n${footer}`;
      const room = ISSUE_LIMIT - head.length - note.length;
      const rest = lines.slice(summaryEnd).join("\n");
      body = `${head}\n${rest.slice(0, Math.max(0, rest.lastIndexOf("\n", room)))}${note}`;
    }
    writeFileSync(ISSUE, body);
  }
  process.exit(open.length ? 1 : 0);
}
