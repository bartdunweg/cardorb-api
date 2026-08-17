import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * One source for a colour, enforced.
 *
 * The tokens have three consumers that cannot read CSS: the web manifest, which
 * is JSON; the viewport's themeColor, which is a JS object Next serialises into
 * meta tags; and the two OG images, which are drawn by Satori from React that
 * never reaches a browser. Each of them held its own copy of #fafafa, and two
 * of them held approximations of the text tiers rather than the tiers.
 *
 * tokens.css carried a comment saying so — "if the token moves, three places
 * move" — which is an honest warning and not a mechanism. This is the
 * mechanism. It does not stop somebody writing a colour; it stops them writing
 * one *somewhere the token cannot reach*, which is the failure that actually
 * happened.
 *
 * The OG images were the worst of it, and it is worth recording what was found
 * when they were converted: both used #767676 for their eyebrow — the exact
 * value tokens.css rejected for measuring 4.35:1 on the page, under AA. So the
 * preview card of every shared link carried the contrast bug the app had
 * already fixed, because it was written down twice and only corrected once.
 */

/** Where a raw colour is still the honest answer. */
const ALLOWED = [
  // The values themselves have to live somewhere.
  "lib/design/tokens.ts",
  // Its own fixtures are hexes on purpose: it asserts things about colours.
  "lib/design/tokens.test.ts",
  "lib/design/contrast.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
}

describe("colours are not written down twice", () => {
  const files = [...walk("app"), ...walk("lib")].filter((f) => !ALLOWED.some((a) => f.endsWith(a)));

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Only in code. A hex inside a comment is usually the *history* of a value
    // — "while it said #ffffff the chrome was a shade off" — and deleting that
    // sentence would remove the reason the current value is what it is.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const found = code.match(/#[0-9a-fA-F]{6}\b/g);

    if (found) {
      it(`${file} uses tokens rather than raw hex`, () => {
        expect(
          found,
          `${file} writes a colour that lib/design/tokens.ts cannot reach. ` +
            `Import { colour } from lib/design/tokens instead — this is how the ` +
            `OG images ended up shipping a value the app had already rejected ` +
            `for failing AA.`,
        ).toBeNull();
      });
    }
  }

  it("checked a meaningful number of files", () => {
    // A guard on the guard: if the walk ever silently matches nothing, this
    // suite passes while checking nothing at all.
    expect(files.length).toBeGreaterThan(40);
  });
});
