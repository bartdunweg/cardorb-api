import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every var(--token) resolves to something.
 *
 * A custom property that was never declared is not an error. `color:
 * var(--colour-label)` — one letter out — inherits the parent's colour and the
 * build says nothing, the browser says nothing, and the only signal is that a
 * heading looks slightly wrong on a screen nobody opened yet.
 *
 * This was written after doing exactly that: five variables invented while
 * styling the set index, all of them plausible (`--space-16`, `--fs-caption`,
 * `--radius-card`), none of them real, and `npm run build` compiled clean. The
 * scale here is stepped rather than pixel-valued — `--space-4` *is* 16px — so
 * the names that feel obvious are precisely the ones that do not exist.
 *
 * Only checks the tokens this project defines. A var() with a fallback is fine
 * by construction, and the ones Lightning CSS and Tailwind generate are not
 * ours to know about.
 *
 * ── It used to read the stylesheets only, and that was the smaller half ────
 *
 * Measured when the scales moved into `@theme` (ADR-0053): there are ~720
 * `var(--token)` references inside `.tsx`, against ~200 in the sheets. Every one
 * of them is an arbitrary-value class — `[font-size:var(--fs-small)]` — which
 * Tailwind passes through to the browser verbatim without ever asking whether
 * the name exists. So the larger half of this project's token references were
 * the unchecked half, and they are the half being rewritten: renaming a token
 * and missing a className is exactly the silent-inheritance failure above, at
 * the moment it is most likely to happen.
 */

/**
 * Tailwind's own default theme, which this test cannot see.
 *
 * Untitled UI's theme (spliced into tailwind.generated.css by
 * scripts/gen-tokens.mjs) expresses its semantic layer in terms of Tailwind's
 * stock palette — `var(--color-neutral-300)`, `var(--color-red-500)`,
 * `var(--spacing)` and 153 more. None of those are declared in app/styles,
 * because Tailwind declares them itself from `@import "tailwindcss"`.
 *
 * That is asserted rather than assumed. Built once and read back out of
 * .next/static:
 *
 *   --color-neutral-300:#d4d4d4
 *   --spacing:.25rem
 *   --color-red-500:#fb2c36
 *
 * So they resolve. The existing `--tw-` filter below does not catch them
 * because Tailwind's theme variables carry no prefix.
 *
 * Deliberately a shape and not a list of 156 names: a list would have to be
 * re-derived every time Untitled UI reaches for one more step. Deliberately
 * *not* a blanket `--color-` skip either — a typo like `--color-neutrl-300`
 * is not in a Tailwind namespace and still fails, which is the whole job.
 */
const TAILWIND_PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|" +
  "violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const TAILWIND_DEFAULT = new RegExp(
  `^(--color-(${TAILWIND_PALETTE})-\\d+|--color-(white|black|transparent)|--spacing)$`,
);

// `app/globals.css` as well as the two files left in app/styles: the resets,
// the keyframes and the eleven layout tokens were inlined there when tokens.css,
// base.css, components.css and pages.css stopped being worth a file each.
const STYLES = "app/styles";
const EXTRA_SHEETS = ["app/globals.css"];
/** Where the arbitrary-value classes are. */
// `components/custom` as well as `app`: Card Orb's own components moved out of
// app/components when the Untitled UI tree arrived beside them, and this test
// silently stopped seeing three quarters of its subject for one commit.
// `components/base` too, since the shape tokens are read from inside the
// vendored tree. It was left out while that tree only ever referenced Untitled
// UI's own theme variables, which are declared in the same file that uses them;
// once Card Orb's tokens started appearing in there, "vendored" stopped being a
// reason not to look. Upstream's own `var()`s pass — they resolve against the
// theme block the generator splices in.
const CODE = ["app", "lib", "components/custom", "components/base"];

/** Everything declared anywhere in the stylesheets, generated ones included. */
function declared(): Set<string> {
  const names = new Set<string>();
  const sheets = [
    ...readdirSync(STYLES)
      .filter((f) => f.endsWith(".css"))
      .map((f) => join(STYLES, f)),
    ...EXTRA_SHEETS,
  ];
  for (const file of sheets) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) names.add(m[1]!);
  }
  return names;
}

/** Every `.ts`/`.tsx` under app/ and lib/, where the className strings are. */
function code(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) code(path, out);
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
}

/** Every var() reference, minus the ones that carry their own fallback. */
function referenced(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const files = [
    ...readdirSync(STYLES)
      .filter((f) => f.endsWith(".css"))
      .map((f) => join(STYLES, f)),
    ...EXTRA_SHEETS,
    ...CODE.flatMap((dir) => code(dir)),
  ];
  for (const file of files) {
    let source = readFileSync(file, "utf8");
    // In code, only the code. A var() inside a comment is prose about a token —
    // "renaming --colour-label one letter out inherits silently" — and the
    // examples in that prose are deliberately names that do not exist.
    if (/\.tsx?$/.test(file)) {
      source = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    }
    for (const m of source.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)) {
      // A comma means a fallback follows, which is a deliberate "this may not
      // exist" and none of this test's business.
      if (m[2] === ",") continue;
      const name = m[1]!;
      uses.set(name, [...(uses.get(name) ?? []), file]);
    }

    // Tailwind v4's shorthand for the same thing: `px-(--control-px-md)` is
    // `px-[var(--control-px-md)]` with the `var()` elided. It compiles to the
    // identical declaration and fails in the identical silent way, but the loop
    // above cannot see it — there is no `var(` to match. Missing this would
    // have made the shorthand the one form of token reference in the project
    // that nothing checks, which is the reverse of what this file is for.
    //
    // `[\w.-]` before the paren so it only matches a real utility prefix and
    // not, say, the `(` of a function call in ordinary code.
    for (const m of source.matchAll(/[\w.-]-\(\s*(--[a-z0-9-]+)\s*\)/g)) {
      const name = m[1]!;
      uses.set(name, [...(uses.get(name) ?? []), file]);
    }
  }
  return uses;
}

describe("custom properties", () => {
  const known = declared();
  const used = referenced();

  it("declares every token the stylesheets reach for", () => {
    const missing = [...used.entries()]
      // Tailwind's own machinery and the Lightning CSS light-dark() polyfill
      // declare these at build time; they are correct and not ours to define.
      .filter(([name]) => !name.startsWith("--tw-") && !name.startsWith("--lightningcss-"))
      // React Aria writes this one onto the popover element itself, in JS, at
      // the moment it positions it — so it is correct, it is not ours to
      // declare, and no stylesheet will ever contain it. Surfaced the first
      // time this test was pointed at `components/base`, from
      // `origin-(--trigger-anchor-point)` in dropdown.tsx and tooltip.tsx.
      // Verified rather than assumed: it is written in
      // node_modules/react-aria-components/dist/private/Popover.cjs.
      .filter(([name]) => name !== "--trigger-anchor-point")
      .filter(([name]) => !TAILWIND_DEFAULT.test(name))
      .filter(([name]) => !known.has(name))
      .map(([name, files]) => `${name} (used in ${[...new Set(files)].join(", ")})`);

    expect(
      missing,
      `These resolve to nothing. A missing custom property is silent: the ` +
        `declaration is dropped and the element inherits, so the build passes ` +
        `and the screen is quietly wrong.\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("is looking at a real stylesheet, and at the components too", () => {
    // Without this the suite passes when the glob breaks and nothing is read.
    expect(known.size).toBeGreaterThan(80);
    expect(used.size).toBeGreaterThan(40);
    // And separately that the .tsx half is being reached at all: the first
    // version of this test read only app/styles, and the components are where
    // three quarters of the references are.
    // Ten rather than twenty: the Untitled UI migration took the count from
    // ~180 distinct tokens down to a couple of dozen, and this is a canary for
    // the glob breaking, not a floor anybody should be building up to. If it
    // ever reads zero, the directory list above is wrong again.
    const inCode = [...used.values()].filter((files) => files.some((f) => /\.tsx?$/.test(f)));
    expect(inCode.length).toBeGreaterThan(10);
  });

  // The name deliberately spells out no example. A test *title* is a string,
  // not a comment, so the comment-stripping above does not reach it — this test
  // failed on its own first run because its name contained a made-up token in
  // the shorthand form and the new branch dutifully reported it missing. Which
  // is the guard working, but a poor way to say so.
  it("sees Tailwind's parenthesised shorthand, not only the spelled-out var()", () => {
    // A guard on the guard, and not a formality: the shorthand branch was added
    // alongside the first tokens written in that form, and if its regex ever
    // stops matching, this whole file goes quiet about them rather than
    // failing. `--control-px-md` appears in button.tsx only as
    // `px-(--control-px-md)` — there is no `var(` anywhere near it — so this
    // assertion cannot be satisfied by the older branch.
    expect([...used.keys()]).toContain("--control-px-md");
  });
});
