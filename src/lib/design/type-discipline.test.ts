import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No font size is written anywhere but styles/theme.css.
 *
 * The rule was already true when this was written — the app had gone from 88
 * headings with five arbitrary sizes between them to zero — and that is exactly
 * when it is worth enforcing. A rule nobody can check is a rule that decays the
 * first time somebody is in a hurry, and the whole point of theme.css is that a
 * design value has one owner.
 *
 * It checks the two spellings Tailwind offers for going around the scale:
 * `[font-size:…]`, the raw property, and `text-[…]` with a number in it. The
 * second has to be careful: `text-[#fff]` is a colour and `text-[13ch]` is a
 * measure, so only a leading digit or a decimal counts.
 *
 * Vendored Untitled UI is not checked. Its files are rewritten wholesale by the
 * CLI, so a failure here would be one nobody can fix without losing the fix on
 * the next `npm run ui:add`.
 */

const ROOTS = ["src/app", "src/features", "src/components/shared", "src/providers"];

/** `[font-size:32px]` and `text-[13px]`, but not `text-[#fff]` or `text-[42ch]`. */
const RAW_SIZE = /\[font-size:[^\]]+\]|\btext-\[\d/;

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")) {
      yield path;
    }
  }
}

describe("every font size comes from theme.css", () => {
  it("nothing writes a size into a className", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sources(root)) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (RAW_SIZE.test(line))
              offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
          });
      }
    }

    // The message carries the fix, because the useful thing to know here is not
    // that a rule was broken but which of the two answers applies: a size that
    // matches a step snaps to it, and one that genuinely does not gets a name in
    // theme.css. `--text-micro` (9px, a count inside a 20px icon) and
    // `--text-hero` (a clamp Untitled UI's stepped scale cannot express) are
    // both what the second answer looks like.
    expect(
      offenders,
      `A font size belongs in src/styles/theme.css, not in a className.\n` +
        `Snap it to an existing step, or give it a name there and use that.\n\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("finds the files it is meant to be checking", () => {
    // Without this the test above passes loudly on an empty list the day a
    // directory is renamed — which is the failure mode of every check that
    // walks a tree by path.
    const count = ROOTS.reduce((n, root) => n + [...sources(root)].length, 0);
    expect(count).toBeGreaterThan(100);
  });
});
