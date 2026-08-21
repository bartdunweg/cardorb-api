import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { over, ratio } from "./contrast";
import { blur, colour, ease, font, fontWeight, leading, radius, surfaces, text } from "./tokens";

/** camelCase → kebab-case, the same rule the generator writes the names with. */
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

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

/**
 * The surfaces a tier is read against, composited where translucent.
 *
 * "The glass card" was a fourth entry here until ADR-0090. It composited
 * `colour.glass`, which no component had rendered since ADR-0061 removed glass,
 * so every tier was being held to a floor on a surface that did not exist —
 * a stricter test than reality, but a test of nothing, and the kind that makes a
 * real regression look like it was already covered.
 */
function surfacesFor(theme: "light" | "dark") {
  const s = surfaces[theme];
  return [
    ["the page", s.page],
    ["a card", s.card],
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
  // This rejection was removed once and is back, which is the argument for
  // writing rejections down at all. It was dropped when ADR-0024 made the light
  // page pure white, on the reasoning that #767676 clears AA on white and the
  // background it had failed on was gone. That background is not gone — the
  // Untitled UI adoption put the page back on #fafafa (bgGrouped.light), so the
  // measurement that rejected #767676 is live again and this asserts it.
  it("light: #767676 is under AA on the page, which is why labelTertiary is darker", () => {
    // tokens.css: "#767676 is 4.54:1 on pure white but this tier also renders
    // on the page, where it measured 4.35."
    expect(ratio("#767676", surfaces.light.page)).toBeLessThan(AA);
  });

  it("dark: #878787 is under AA on the control glass, where the rail's counts live", () => {
    // tokens.css: "#878787 measured 4.26 there and failed axe."
    const control = over(surfaces.dark.control.colour, surfaces.dark.control.over);
    expect(ratio("#878787", control)).toBeLessThan(AA);
  });

  // "#b0b0b0 measured 2.3:1 on the glass" was a third rejection here. It
  // belonged to labelQuaternary, and both went with ADR-0090: the tier had no
  // consumer and the surface it was measured on had not been rendered since
  // ADR-0061. The measurement is in that record.
});

/**
 * The accent carries a word, so it has to clear the floor for words.
 *
 * This replaces three tests that measured `tint` and `tintLabel`, the iOS-blue
 * pair ADR-0090 deleted. The *rule* they encoded is why anything is written
 * here at all, and it is not a fact about blue:
 *
 *   **A colour cleared as a graphic (3:1) is not cleared for use under a word
 *   (4.5:1).**
 *
 * That distinction is what split the pair in the first place — #007aff measured
 * 4.02 on white, fine for a shape and not for a label — and ignoring it put a
 * 4.02:1 button on screen once (ADR-0058).
 *
 * So the rule is kept and pointed at the colour that carries it now. The accent
 * is Untitled UI's `bg-brand-solid` since ADR-0061, and it is drawn with
 * `text-white` on it in at least two live places (tabbarClasses.ts's add button,
 * Segmented.tsx's selected segment). Read from the generated stylesheet rather
 * than hard-coded, so a change to the brand ramp is measured rather than
 * assumed.
 */
describe("the accent clears the floor for the text it carries", () => {
  const brandSolid = readFileSync("app/styles/tailwind.generated.css", "utf8")
    .match(/--color-brand-600:\s*([^;]+);/)?.[1]
    ?.trim();

  it("is declared, or the rest of this block is measuring nothing", () => {
    expect(brandSolid, "--color-brand-600 is gone from the generated stylesheet").toBeDefined();
  });

  it("white on bg-brand-solid clears AA, not merely the graphic floor", () => {
    const measured = ratio("#ffffff", brandSolid!);
    // Stated as two assertions on purpose. The first is the one that matters;
    // the second says out loud that passing the graphic floor would not have
    // been enough, which is the whole point of the rule above.
    expect(
      measured,
      `white on ${brandSolid} is ${measured.toFixed(2)}:1, under AA`,
    ).toBeGreaterThanOrEqual(AA);
    expect(AA).toBeGreaterThan(GRAPHIC);
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

  // "the accent is a single value in both themes" asserted --color-tint here.
  // The accent is Untitled UI's brand ramp since ADR-0061 and the token went
  // with ADR-0090; what replaces this is the AA check further up, which measures
  // the accent that is actually on screen.

  /**
   * The same camelCase → kebab-case the generator applies, so `orbXs` is
   * looked up as `--radius-orb-xs`. This loop read the keys literally until
   * the radius scale gained a camelCase name: the four Tailwind-shaped ones
   * (`xs`/`sm`/`md`/`lg`) moved to `orbXs`…`orbLg` so that `rounded-lg` stops
   * meaning 24px inside components this project did not write. See the scale's
   * own comment in tokens.ts, and ADR-0056.
   */
  for (const [name, expected] of Object.entries(radius)) {
    const prop = `--radius-${kebab(name)}`;
    it(`${prop} still reads ${expected}`, () => {
      const value = css.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1]?.trim();
      expect(value, `${prop} is missing from tailwind.generated.css`).toBe(expected);
    });
  }

  it("every scale reaches @theme, which is the only reason a utility exists", () => {
    // Not a formality. A token emitted into :root but not into @theme is
    // invisible to Tailwind: `text-small` silently does not exist, and a
    // className carrying it renders at the inherited size with no error
    // anywhere. That is the failure this whole change was made to remove, so it
    // is the one assertion that has to outlive the change.
    const theme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const expected = [
      ...Object.keys(text).map((n) => `--text-${kebab(n)}`),
      ...Object.keys(leading).map((n) => `--leading-${kebab(n)}`),
      ...Object.keys(fontWeight).map((n) => `--font-weight-${kebab(n)}`),
      ...Object.keys(font).map((n) => `--font-${kebab(n)}`),
      ...Object.keys(ease).map((n) => `--ease-${kebab(n)}`),
      ...Object.keys(blur).map((n) => `--blur-${kebab(n)}`),
    ];
    expect(expected.filter((name) => !theme.includes(`${name}:`))).toEqual([]);
  });

  it("emits no legacy aliases, because that migration is finished", () => {
    // This used to assert the opposite — that every --fs-* alias existed and
    // was a var() at the canonical name rather than a copy of its value, since
    // an alias holding a value is a second source and a second source is the
    // drift this file exists to prevent.
    //
    // Every one of those aliases has since lost its last reader, so ALIASES in
    // scripts/gen-tokens.mjs is empty and the block it fed emits nothing. The
    // generator's own comment always said an empty block was how the migration
    // would report itself finished; this is the assertion that keeps it that
    // way, so a re-added alias has to be a deliberate act rather than a
    // leftover.
    const aliases = [...css.matchAll(/--(?:fs|fw|lh)-[a-z-]+:/g)].map((m) => m[0]);
    expect(aliases).toEqual([]);
  });
});

/**
 * The ordering rule tokens.css claimed a test held, which no file held.
 *
 * Its comment read: "a floor is chosen against its neighbours, not against its
 * own ceiling, and design-system.test.ts holds the ordering to it." That file is
 * not in this repo and by the look of it never was — the same shape of gap the
 * contrast comments had at the top of this file.
 *
 * The bug it describes is real and specific. The floors were once set by
 * stepping the desktop scale down as a block, which works for the steps on that
 * scale and quietly breaks the ones beside it: a step a rung above body on a
 * desktop landed on the same 14px as body on a phone. So the largest thing on a
 * card came out the size of the copy around it, at exactly the width where it
 * mattered most.
 */
describe("the type scale keeps its order at both ends", () => {
  /** `clamp(floor, slope, ceiling)` → the two numbers that are px. */
  function ends(value: string): [number, number] | null {
    const m = value.match(/^clamp\(\s*([\d.]+)px\s*,[^,]+,\s*([\d.]+)px\s*\)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  const steps = Object.entries(text)
    .map(([name, value]) => [name, ends(value)] as const)
    .filter((s): s is readonly [string, [number, number]] => s[1] !== null);

  it("is reading a real scale", () => {
    // `control`, `controlLabel` and `tiny` are deliberately not clamps, so this
    // guards against the regex quietly matching nothing at all.
    expect(steps.length).toBeGreaterThan(6);
  });

  for (const [aName, [aFloor, aCeiling]] of steps) {
    for (const [bName, [bFloor, bCeiling]] of steps) {
      if (aCeiling <= bCeiling) continue;
      it(`${aName} is above ${bName} on a phone too`, () => {
        expect(
          aFloor,
          `${aName} is ${aCeiling}px to ${bName}'s ${bCeiling}px on a desktop, but ` +
            `${aFloor}px to ${bFloor}px at 640. A floor is chosen against its ` +
            `neighbours, not against its own ceiling.`,
        ).toBeGreaterThanOrEqual(bFloor);
      });
    }
  }
});
