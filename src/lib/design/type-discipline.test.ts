import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No font size and no letter-spacing is written anywhere but styles/theme.css.
 *
 * The size half of the rule was already true when this was written — the app had
 * gone from 88 headings with five arbitrary sizes between them to zero — and that
 * is exactly when it is worth enforcing. A rule nobody can check is a rule that
 * decays the first time somebody is in a hurry, and the whole point of theme.css
 * is that a design value has one owner.
 *
 * The letter-spacing half was added later, and was *not* already true: fourteen
 * classNames carried an arbitrary tracking value — `tracking-[-0.045em]` five
 * times over — three of them writing the number directly over the
 * `--text-display-md--letter-spacing` they had just applied. Five tokens
 * (`--tracking-display` and its four siblings) replaced them, and this is what
 * stops the fifteenth. Both halves are one test because they are one rule: the
 * axis differs, the argument does not.
 *
 * It checks the two spellings Tailwind offers for going around the scale, for
 * each axis: the raw property and the arbitrary utility. The `text-` one has to
 * be careful, because `text-[#fff]` is a colour and `text-[13ch]` is a measure,
 * so only a leading digit counts. The tracking one needs no such care — every
 * arbitrary value it can carry is a letter-spacing.
 *
 * Comments are stripped before scanning. Not fussiness: the paragraph above
 * quotes a className this rejects, and so does theme.css's own comment
 * explaining why the tokens exist. The first version of the sibling check in
 * app/main-landmark.test.ts failed on exactly this — "a test that cannot tell an
 * element from a sentence about one is a test that punishes writing the
 * sentence". Lifted from there rather than reinvented, with one change: blanking
 * comments in place instead of deleting them, so a reported line number still
 * points at the right line.
 *
 * Vendored Untitled UI is not checked. Its files are rewritten wholesale by the
 * CLI, so a failure here would be one nobody can fix without losing the fix on
 * the next `npm run ui:add`.
 */

// src/lib is in the list because a design value can be written in a class string
// anywhere, and lib/ holds several — cardModalClasses.ts is a className module
// that happens to live under features/, and nothing says the next one will.
// Recommended by the audit, and it was already true when added: the check went
// green on the first run, which is the only time it is safe to widen a rule.
const ROOTS = ["src/app", "src/features", "src/components/shared", "src/providers", "src/lib"];

const AXES = [
  {
    name: "font size",
    /** The raw property, and the utility with a number in it rather than a colour. */
    pattern: /\[font-size:[^\]]+\]|\btext-\[\d/,
    fix:
      `A font size belongs in src/styles/theme.css, not in a className.\n` +
      `Snap it to an existing step, or give it a name there and use that.`,
  },
  {
    name: "letter-spacing",
    /** The raw property, and the arbitrary tracking utility in any form. */
    pattern: /\[letter-spacing:[^\]]+\]|\btracking-\[/,
    fix:
      `Letter-spacing belongs in src/styles/theme.css, not in a className.\n` +
      `Use --tracking-display / -heading / -snug / -caps / -caps-wide, or name a\n` +
      `new one there if none of the five is what you mean.`,
  },
];

/**
 * The file with its comments blanked out, line count preserved.
 *
 * A block comment becomes the same number of empty lines it occupied, so
 * `offenders` can still report `file:line` against the real file.
 */
function scannable(file: string): string[] {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/^\s*\/\/.*$/gm, "")
    .split("\n");
}

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")) {
      yield path;
    }
  }
}

describe("every type value comes from theme.css", () => {
  // The message carries the fix, because the useful thing to know here is not
  // that a rule was broken but which of the two answers applies: a value that
  // matches a step snaps to it, and one that genuinely does not gets a name in
  // theme.css. `--text-micro` (9px, a count inside a 20px icon), `--text-hero`
  // (a clamp Untitled UI's stepped scale cannot express) and
  // `--tracking-caps-wide` (one caller, so the rule has no exception) are all
  // what the second answer looks like.
  it.each(AXES)("nothing writes a $name into a className", ({ pattern, fix }) => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sources(root)) {
        scannable(file).forEach((line, i) => {
          if (pattern.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
        });
      }
    }

    expect(offenders, `${fix}\n\n${offenders.join("\n")}`).toEqual([]);
  });

  it("finds the files it is meant to be checking", () => {
    // Without this the test above passes loudly on an empty list the day a
    // directory is renamed — which is the failure mode of every check that
    // walks a tree by path.
    const count = ROOTS.reduce((n, root) => n + [...sources(root)].length, 0);
    expect(count).toBeGreaterThan(100);
  });

  it("blanks a comment without blanking the code beside it", () => {
    // The stripping is the part most likely to go quietly wrong: blank too much
    // and the check stops checking, which looks identical to passing. This file
    // is its own fixture — the doc comment at the top quotes a className the
    // rule rejects, and AXES writes the same characters as code.
    //
    // Both needles are assembled from two halves, or these very lines would be
    // the offenders they are looking for. That is the same trap one rung up.
    const lines = scannable("src/lib/design/type-discipline.test.ts");
    const inProse = "tracking-" + "[-0.045em]";
    const inCode = "\\btracking-" + "\\[";

    expect(lines.some((l) => l.includes(inProse))).toBe(false);
    expect(lines.some((l) => l.includes(inCode))).toBe(true);
  });
});
