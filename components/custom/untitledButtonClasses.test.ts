import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLORS, COMMON, SIZES } from "@/components/custom/untitledButtonClasses";

/**
 * The copy in untitledButtonClasses.ts still equals the vendored button.
 *
 * That file explains why the recipe is copied rather than imported: the
 * component is `"use client"`, so a server component importing its `styles`
 * gets Next's client-reference proxy and `styles.common` is `undefined` at
 * prerender. /_not-found and /cards both died on it.
 *
 * A copy is only safe if something fails when it drifts, which is the same
 * argument `gen-tokens.mjs --check` makes for the generated stylesheet. This is
 * that check. It reads the vendored file as **text**, so the client boundary
 * does not apply, and it will fail the next time `npm run ui:add` brings down a
 * new upstream button — which is the moment somebody needs to be told.
 *
 * ── What it compares, and why not the output ───────────────────────────────
 *
 * The copied strings, not the string `untitledButton()` returns. `cx` is
 * tailwind-merge, and it correctly drops classes that conflict: the destructive
 * colours carry `outline-error`, which beats `outline-brand` from the common
 * part, and both parts set `before:absolute`. Asserting on the merged output
 * would fail on tailwind-merge doing its job. The thing that must not drift is
 * the input.
 *
 * When it fails: copy the changed string across, look at what moved, then
 * re-run. It is not a snapshot to bless.
 */
const SOURCE = "components/base/buttons/button.tsx";

/** The value of one `root:` key inside `styles`, joined the way the source does. */
function root(source: string, from: number): string {
  const rootAt = source.indexOf("root:", from);
  const after = source.slice(rootAt + "root:".length);

  // Either `root: "…"` or `root: [ "…", "…" ].join(" ")`, the latter with
  // comments between the strings that are not part of the value.
  if (after.trimStart().startsWith("[")) {
    const close = after.indexOf("].join");
    return [...after.slice(0, close).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => m[1]!)
      .filter(Boolean)
      .join(" ");
  }
  return after.match(/"((?:[^"\\]|\\.)*)"/)![1]!;
}

/** Where a named entry starts inside `styles`, e.g. `md: {` or `"link-color": {`. */
function entry(source: string, name: string): number {
  const at = source.search(new RegExp(`\\n\\s+"?${name}"?: \\{`));
  expect(at, `${name} is gone from ${SOURCE} — did upstream rename it?`).toBeGreaterThan(-1);
  return at;
}

describe("the copied Untitled UI button recipe", () => {
  const source = readFileSync(SOURCE, "utf8");

  it("is reading the real component", () => {
    // Without this the suite passes when the path breaks and nothing is read.
    expect(source).toContain("export const styles = sortCx(");
    expect(source.length).toBeGreaterThan(2000);
  });

  it("common still matches", () => {
    expect(COMMON).toBe(root(source, entry(source, "common")));
  });

  // Only the sizes and colours this app hands out. Untitled UI ships more;
  // copying those would be more strings to keep in step for nothing, and the
  // `keyof typeof` in the module means an unlisted one cannot be asked for.
  for (const size of Object.keys(SIZES) as (keyof typeof SIZES)[]) {
    it(`sizes.${size} still matches`, () => {
      expect(SIZES[size]).toBe(root(source, entry(source, size)));
    });
  }

  for (const color of Object.keys(COLORS) as (keyof typeof COLORS)[]) {
    it(`colors.${color} still matches`, () => {
      expect(COLORS[color]).toBe(root(source, entry(source, color)));
    });
  }
});
