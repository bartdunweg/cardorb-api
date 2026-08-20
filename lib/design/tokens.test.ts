import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { over, ratio } from "./contrast";
import { colour, radius, surfaces } from "./tokens";

/**
 * The test the stylesheets thought they had.
 *
 * tokens.css argues every colour by a measured ratio — "#767676 measured 4.47:1
 * and 4.35:1, just under AA", "#878787 measured 4.26 there and failed axe" —
 * and cites two files to hold those claims. Neither file is in the repo. So
 * until this one, the contrast floors of a live app were held up by prose.
 *
 * Two kinds of assertion below, and the second kind is the unusual one:
 *
 * The floors — every text tier clears 4.5:1 on every surface it lands on.
 * The rejections — the values that were *tried and failed* are asserted to
 * still fail. That is not padding. The comments record them precisely so a
 * future reader does not re-lighten a tier by two notches and reintroduce a
 * bug that was already found once; a test that only checks the current value
 * lets that happen and reports green.
 */

const AA = 4.5;
/** WCAG's floor for a graphic that carries meaning without being text. */
const GRAPHIC = 3;

/** The three surfaces a tier is read against, composited where translucent. */
function surfacesFor(theme: "light" | "dark") {
  const s = surfaces[theme];
  return [
    ["the page", s.page],
    ["a card", s.card],
    ["the glass card", over(s.glass.colour, s.glass.over)],
    ["the control glass", over(s.control.colour, s.control.over)],
  ] as const;
}

describe("text tiers clear AA on every surface they touch", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const tier of ["label", "labelSecondary", "labelTertiary"] as const) {
      for (const [name, surface] of surfacesFor(theme)) {
        it(`${theme}: ${tier} on ${name}`, () => {
          const value = colour[tier][theme];
          expect(
            ratio(value, surface),
            `${value} on ${surface} (${name}, ${theme}) is below AA`,
          ).toBeGreaterThanOrEqual(AA);
        });
      }
    }
  }
});

describe("the values that were tried and failed still fail", () => {
  // The #767676-on-the-page rejection this described no longer applies: it was
  // measured against the #fafafa page background, which is gone now that
  // bgGrouped.light is #ffffff (see the light branch of that token). #767676
  // clears AA on pure white — that was always true and is why it was tempting —
  // so the case that made it fail is gone with the background it failed on.
  // labelTertiary is unaffected: the "text tiers clear AA" describe above
  // still checks its actual value against every current surface.

  it("dark: #878787 is under AA on the control glass, where the rail's counts live", () => {
    // tokens.css: "#878787 measured 4.26 there and failed axe."
    const control = over(surfaces.dark.control.colour, surfaces.dark.control.over);
    expect(ratio("#878787", control)).toBeLessThan(AA);
  });

  it("light: #b0b0b0 is under 3:1 on the glass, which is why it is not the logo tier", () => {
    // tokens.css: "#b0b0b0 measured 2.3:1 on the glass".
    const glass = over(surfaces.light.glass.colour, surfaces.light.glass.over);
    expect(ratio("#b0b0b0", glass)).toBeLessThan(GRAPHIC);
  });
});

describe("the backdrop tier sits just under the graphic floor, deliberately", () => {
  /**
   * The one place a claim in tokens.css turned out to be wrong, and the test is
   * how it was found rather than an argument about it.
   *
   * Two comments in that file disagree about the same measurement. The light
   * block says "this is 3.1:1 and still reads as a backdrop" (tokens.css:76).
   * The dark block says "2.98:1 here and 2.98 in light" (:537). This measures
   * 2.98 in both, so the dark comment is right and the light one is stale.
   *
   * And 2.98 is a decision, not a miss. The same comment records what happened
   * when it was raised: "#7a7a7a was 3.83 and the logos sat forward of the work
   * they are meant to sit behind." WCAG asks 3:1 of a graphic that carries
   * information; a set's wordmark behind its own cards is decoration standing
   * in for a label that is also written out beside it, and two hundredths under
   * the floor buys the recession the tier exists for.
   *
   * So the floor here is 2.9 rather than 3, with the reason attached. Written
   * down because a later reader who only sees `2.9` will assume it is a typo
   * for 3 and "fix" it, which is exactly how the logos come forward again.
   */
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: the logo tier is close to 3:1 on the glass without reaching AA`, () => {
      const s = surfaces[theme];
      const glass = over(s.glass.colour, s.glass.over);
      const value = colour.labelQuaternary[theme];
      expect(ratio(value, glass)).toBeGreaterThanOrEqual(2.9);
      expect(ratio(value, glass)).toBeLessThan(AA);
    });
  }
});

describe("the accent is split because one value cannot do both jobs", () => {
  it("the fill clears 3:1 and does not pretend to be text", () => {
    // This is the bug the missing a11y test would have caught: nothing in the
    // codebase said the accent was unusable as a word.
    expect(ratio(colour.tint.light, surfaces.light.card)).toBeGreaterThanOrEqual(GRAPHIC);
    expect(ratio(colour.tint.light, surfaces.light.card)).toBeLessThan(AA);
    expect(ratio(colour.tint.light, surfaces.light.page)).toBeLessThan(AA);
  });

  it("the text tier clears AA on both light surfaces", () => {
    expect(ratio(colour.tintLabel.light, surfaces.light.card)).toBeGreaterThanOrEqual(AA);
    expect(ratio(colour.tintLabel.light, surfaces.light.page)).toBeGreaterThanOrEqual(AA);
  });

  it("dark needs no darkening: system blue already clears AA there", () => {
    expect(ratio(colour.tintLabel.dark, surfaces.dark.card)).toBeGreaterThanOrEqual(AA);
  });
});

describe("this file and the stylesheet it generates agree", () => {
  /**
   * What survived the direction being reversed.
   *
   * This began as a drift guard between two hand-maintained copies: the values
   * here and the values in tokens.css. That job is gone — the CSS is generated
   * now, and `npm run check` regenerates it and fails on a diff, which is a
   * stronger guarantee than any assertion could be.
   *
   * What is left is worth more than the drift check was. It asserts that the
   * *numbers* are still the ones the prose argued for: that the tier which
   * measured 4.35:1 on the page has not crept back, that the dark palette still
   * matches its light counterpart's ratio. A generator will faithfully emit a
   * wrong value; this is what notices the value is wrong.
   *
   * Reading the generated file rather than the source is deliberate. Comparing
   * the module to itself proves nothing. This proves the thing the browser is
   * handed says what the module says.
   */
  const css = readFileSync("app/styles/tailwind.generated.css", "utf8");

  const pairs: [string, { light: string; dark: string }][] = [
    ["--color-label", colour.label],
    ["--color-label-secondary", colour.labelSecondary],
    ["--color-label-tertiary", colour.labelTertiary],
    ["--color-label-quaternary", colour.labelQuaternary],
    ["--color-bg-surface", colour.bgSurface],
    ["--color-bg-grouped", colour.bgGrouped],
  ];

  for (const [name, expected] of pairs) {
    it(`${name} still reads ${expected.light} / ${expected.dark}`, () => {
      const value = css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
      expect(value, `${name} is missing from tokens.css`).toBeDefined();

      const both = value!.match(/^light-dark\(\s*([^,]+),\s*(.+)\s*\)$/);
      expect(both, `${name} is no longer a light-dark() pair: ${value}`).not.toBeNull();
      expect(both![1]!.trim(), `${name} light`).toBe(expected.light);
      expect(both![2]!.trim(), `${name} dark`).toBe(expected.dark);
    });
  }

  it("the accent is a single value in both themes, on purpose", () => {
    // The one colour that should not shift when the lights go out: it is the
    // only one carrying "this is the thing you chose".
    const value = css.match(/--color-tint:\s*([^;]+);/)?.[1]?.trim();
    expect(value).toBe(colour.tint.light);
    expect(colour.tint.light).toBe(colour.tint.dark);
  });

  /**
   * The same camelCase → kebab-case the generator applies, so `orbXs` is
   * looked up as `--radius-orb-xs`. This loop read the keys literally until
   * the radius scale gained a camelCase name: the four Tailwind-shaped ones
   * (`xs`/`sm`/`md`/`lg`) moved to `orbXs`…`orbLg` so that `rounded-lg` stops
   * meaning 24px inside components this project did not write. See the scale's
   * own comment in tokens.ts, and ADR-0055.
   */
  const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

  for (const [name, expected] of Object.entries(radius)) {
    const prop = `--radius-${kebab(name)}`;
    it(`${prop} still reads ${expected}`, () => {
      const value = css.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1]?.trim();
      expect(value, `${prop} is missing from tailwind.generated.css`).toBe(expected);
    });
  }
});
