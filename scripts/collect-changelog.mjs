#!/usr/bin/env node

/**
 * Build docs/CHANGELOG.md out of the fragments in docs/changelog.d/.
 *
 * The file has claimed to be generated since the day it was created — "Generated
 * from fragments in `changelog.d/`. Do not hand-edit; add a fragment instead." —
 * and nothing generated it. Ninety-five fragments accumulated across nine days
 * while the changelog itself stayed eight lines long and stopped at 2026-08-14,
 * with two bullets in it that match no fragment at all, because somebody wrote
 * them by hand. A document that says how it is maintained and is not maintained
 * that way is worse than one that says nothing: it is believed.
 *
 * So either the claim goes or the generator arrives. This is the generator.
 *
 * Fragments are **not** consumed. Every other tool in this family (towncrier and
 * its imitators) deletes a fragment once it is released, because it is building
 * release notes and a release happens once. This project ships continuously and
 * has no releases, so there is no moment at which a fragment stops being true.
 * Leaving them in place also means this script is a pure function of the
 * directory — run it twice, get the same file — which is what makes `--check`
 * possible at all.
 *
 * `--check` rebuilds in memory and exits 1 on any difference, the same contract
 * as scripts/extract-theme-values.mjs, so scripts/verify.sh catches a fragment
 * somebody added without collecting it.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "docs/changelog.d";
const OUT = "docs/CHANGELOG.md";

/** `2026-08-22-value-chart-axes.md` → the date, which is all the name has to carry. */
const NAMED = /^(\d{4}-\d{2}-\d{2})-.+\.md$/;

/**
 * Two shapes are in the directory and both are kept.
 *
 * Ninety of the fragments are a bare list of `- ` bullets. Five are YAML front
 * matter over two or three prose paragraphs, written when a change needed more
 * than a line — the icon-set switch, the password change. Neither is wrong, and
 * a collector that accepted only the majority shape would be asking five good
 * entries to be rewritten worse. The front matter is dropped (its `date` only
 * ever repeats the filename) and whatever is under it is passed through.
 */
function body(text) {
  const withoutFrontMatter = text.startsWith("---")
    ? text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    : text;
  return withoutFrontMatter.trim();
}

const fragments = readdirSync(DIR)
  .filter((name) => name.endsWith(".md"))
  .sort();

const malformed = fragments.filter((name) => !NAMED.test(name));
if (malformed.length) {
  console.error(
    `\n  A fragment's name is its date, so a fragment that does not start with one\n` +
      `  has nowhere to go. Rename to YYYY-MM-DD-what-changed.md:\n\n` +
      malformed.map((n) => `    ${join(DIR, n)}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

/** date → what was written on it, in filename order within the day. */
const byDate = new Map();
let entries = 0;

for (const name of fragments) {
  const date = NAMED.exec(name)[1];
  const text = body(readFileSync(join(DIR, name), "utf8"));

  if (!text) {
    console.error(`\n  ${join(DIR, name)} is empty once its front matter is off.\n`);
    process.exit(1);
  }

  if (!byDate.has(date)) byDate.set(date, []);
  byDate.get(date).push(text);
  // A bullet each where there are bullets, one where it is prose.
  entries += text.split("\n").filter((line) => line.startsWith("- ")).length || 1;
}

// Newest day first: a changelog is read from the top by somebody asking what
// changed lately, not from the beginning by somebody reading it through.
const days = [...byDate.keys()].sort().reverse();

const markdown =
  `# Changelog\n\n` +
  `Generated from the fragments in \`changelog.d/\` by \`npm run changelog\`.\n` +
  `Do not hand-edit this file; add a fragment instead. \`scripts/verify.sh\` fails\n` +
  `if the two have drifted apart.\n\n` +
  days.map((date) => `## ${date}\n\n${byDate.get(date).join("\n\n")}\n`).join("\n");

// No Prettier round-trip, unlike extract-theme-values.mjs. That script formats
// its output because `npm run check` runs Prettier over the tree and would
// otherwise turn a correct generated file red. Markdown is different:
// .prettierignore excludes `*.md` outright, because every document here is
// hand-wrapped and Prettier reflows prose. Running it anyway would be a no-op
// with a comment claiming it was load-bearing.
const formatted = markdown;

const summary = `${entries} entries across ${days.length} days, from ${fragments.length} fragments`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== formatted) {
    console.error(`\n  ${OUT} does not match ${DIR}/.\n  Run: npm run changelog\n`);
    process.exit(1);
  }
  console.log(`  ${OUT} is up to date (${summary})`);
} else {
  writeFileSync(OUT, formatted);
  console.log(`  wrote ${OUT} — ${summary}`);
}
