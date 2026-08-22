import { describe, expect, it } from "vitest";
import { resolve, toHex } from "../../../scripts/theme-resolve.mjs";
import { ratio } from "./contrast";

/**
 * Every colour this app paints text on, measured against WCAG.
 *
 * ── Why this file exists again ─────────────────────────────────────────────
 *
 * It was deleted on 2026-08-22 with the rest of the token tests, and restored
 * the same day, because removing it removed the only thing that could fail when
 * a colour stopped being readable. This project has already shipped that bug:
 * #767676 went out at 4.47 against a rule asking 4.5, and the comment beside the
 * value quoted the right number while the value did not. A comment cannot fail a
 * build.
 *
 * ── What it measures, and what it deliberately does not ────────────────────
 *
 * The pairs the app actually paints, not every pair the palette can express.
 * `text-quaternary` is measured nowhere here because first-party code uses it
 * zero times — asserting on it would be measuring Untitled UI rather than this
 * app, and a failure would be one nobody could act on.
 *
 * Resolution goes through scripts/theme-resolve.mjs, the same module the token
 * generator uses. That is the point: if the two disagreed about what a token
 * is, this would be measuring a colour the app does not paint.
 */

const hex = (token: string, mode: "light" | "dark") => toHex(resolve(token, mode), token);

/** WCAG 2.2 AA: body text. */
const AA_TEXT = 4.5;

const MODES = ["light", "dark"] as const;

/**
 * The two surfaces text lands on. `bg-tertiary` is left out on purpose: one
 * first-party call site uses it, for a loading block that carries no text.
 */
const SURFACES = ["--color-bg-primary", "--color-bg-secondary"] as const;

/** The three tiers first-party code actually writes. */
const TEXT = ["--color-text-primary", "--color-text-secondary", "--color-text-tertiary"] as const;

describe("text is readable on every surface it lands on", () => {
  for (const mode of MODES) {
    for (const surface of SURFACES) {
      for (const text of TEXT) {
        it(`${text.replace("--color-text-", "")} on ${surface.replace("--color-bg-", "")}, ${mode}`, () => {
          const fg = hex(text, mode);
          const bg = hex(surface, mode);
          // The ratio is in the failure message on purpose: a bare "expected
          // 4.31 to be at least 4.5" does not say which colour moved.
          expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    }
  }
});

describe("the two places text sits on something other than a page surface", () => {
  for (const mode of MODES) {
    it(`a filled button's label, ${mode}`, () => {
      const fg = hex("--color-text-white", mode);
      const bg = hex("--color-bg-brand-solid", mode);
      expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`an error message, ${mode}`, () => {
      const fg = hex("--color-text-error-primary", mode);
      const bg = hex("--color-bg-primary", mode);
      expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});

/**
 * ── The gaps, pinned rather than hidden ────────────────────────────────────
 *
 * Three pairs are below the threshold that would apply to them. None is
 * asserted at AA, because a permanently red test teaches people to stop reading
 * the output. They are pinned at what they measure today instead, so that a
 * change to any of them fails here and has to be looked at — and so the numbers
 * are written somewhere that cannot go stale.
 *
 * All three are Untitled UI's own values, which the standing rule says to take
 * unless the identity or a measurement earns the exception. These are the
 * measurement; what they earn is Bart's decision, not this file's.
 */
describe("known gaps, pinned at today's value", () => {
  it("placeholder text is below AA in dark mode", () => {
    // 4.18 against 4.5. Light mode is 4.74 and passes. Placeholder is text by
    // WCAG's reckoning, so this is a real miss rather than a technicality —
    // it is the hint inside every input on a dark screen.
    const measured = ratio(
      hex("--color-text-placeholder", "dark"),
      hex("--color-bg-primary", "dark"),
    );
    expect(measured).toBeCloseTo(4.18, 2);
    expect(measured).toBeLessThan(AA_TEXT);
  });

  for (const [mode, expected] of [
    ["light", 1.48],
    ["dark", 1.91],
  ] as const) {
    it(`a control's border is below 3:1 in ${mode} mode`, () => {
      // WCAG 1.4.11 asks 3:1 for the boundary of a user interface component,
      // which an input's border is. A decorative hairline between rows is not
      // covered and is not the concern here; the same token draws both.
      const measured = ratio(hex("--color-border-primary", mode), hex("--color-bg-primary", mode));
      expect(measured).toBeCloseTo(expected, 2);
      expect(measured).toBeLessThan(3);
    });
  }
});
