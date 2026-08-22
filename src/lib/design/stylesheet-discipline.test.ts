import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No colour is written in a stylesheet but `styles/theme.css`.
 *
 * R-STYLE-001 has always said theme.css is the only place a design value may be
 * written, and for TypeScript that has been enforced for a while — a font size
 * or a letter-spacing in a className fails `type-discipline.test.ts`, and every
 * colour pair the app paints is measured by `contrast.test.ts`. Stylesheets had
 * nothing. The rule and the code disagreed, in the code's favour, and three
 * separate audits found the same file each time.
 *
 * That file was `styles/poke-holo.css`, which held twelve colours: the six
 * sunpillar steps of the holographic foil, the deep navy and two sheens the
 * diagonal bar is built from, and three shadow alphas. They are tokens now
 * (`--color-foil-*`), and this is what stops the next one.
 *
 * **Scope is `src/styles/` and nothing else.** Vendored Untitled UI ships its own
 * CSS and is rewritten wholesale by `npm run ui:add`; a failure there would be
 * one nobody can fix without losing the fix on the next run. Same exemption, same
 * reason, as the sibling check.
 *
 * What counts as a colour: a hex literal, or an `rgb`/`rgba`/`hsl`/`hsla`
 * function with real arguments. A `var(--…)` inside one of those is fine — that
 * is a token being read, which is the point. Named colours (`red`, `white`) are
 * deliberately not matched: `transparent` and `currentColor` are not design
 * values, and a real named colour is rare enough to be caught in review.
 */

const DIR = "src/styles";
const SOURCE_OF_TRUTH = "theme.css";

/** `#0e152e`, `hsl(2, 100%, 73%)`, `rgba(0,0,0,.25)` — but not `hsl(var(--x))`. */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?![^)]*var\()[^)]*\)/;

/** Comments blanked in place, so a reported line number still points at the line. */
function scannable(file: string): string[] {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .split("\n");
}

const sheets = readdirSync(DIR).filter((name) => name.endsWith(".css"));

describe("every colour in a stylesheet comes from theme.css", () => {
  it("finds the stylesheets it is meant to be checking", () => {
    // Without this the test below passes loudly on an empty list the day the
    // directory moves — the failure mode of every check that walks a tree.
    expect(sheets).toContain(SOURCE_OF_TRUTH);
    expect(sheets.length).toBeGreaterThan(2);
  });

  it("nothing but theme.css writes a colour", () => {
    const offenders: string[] = [];

    for (const name of sheets) {
      if (name === SOURCE_OF_TRUTH) continue;
      scannable(join(DIR, name)).forEach((line, i) => {
        if (COLOUR.test(line)) {
          offenders.push(`${join(DIR, name)}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }

    expect(
      offenders,
      `A colour belongs in src/styles/theme.css, not in another stylesheet.\n` +
        `Give it a name there and read it back with var(--…).\n\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("still sees a colour on a line that also carries a comment", () => {
    // The blanking is the part most likely to go quietly wrong: blank too much
    // and the check stops checking, which looks exactly like passing.
    const withComment = "  color: " + "#ab" + "cdef; /* a note */";
    const onlyComment = "  /* " + "#ab" + "cdef in prose */";
    expect(COLOUR.test(withComment)).toBe(true);
    expect(scannable(join(DIR, SOURCE_OF_TRUTH)).length).toBeGreaterThan(100);
    expect(onlyComment.replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
  });
});
