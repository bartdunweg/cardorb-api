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
 * ── The two that needed a decision, and got one ────────────────────────────
 *
 * These were below their threshold on Untitled UI's own values and were pinned
 * at what they measured, because a permanently red test teaches people to stop
 * reading the output. They are assertions now: the tokens were raised to the
 * lightest values that clear the rule, so the change is the smallest one that
 * meets it rather than the most legible one.
 *
 * R-STYLE-006 says take Untitled UI's value unless the identity or a
 * measurement earns the exception. This is what the measurement bought.
 */
describe("controls and placeholders meet the rule that applies to them", () => {
  /** WCAG 2.2 AA 1.4.11: the boundary of a user interface component. */
  const AA_NON_TEXT = 3;

  for (const mode of MODES) {
    for (const surface of SURFACES) {
      it(`a control's border on ${surface.replace("--color-bg-", "")}, ${mode}`, () => {
        // This token draws every control edge in the app: input, checkbox,
        // radio, combobox, button-group, the secondary button. It was 1.48 in
        // light and 1.91 in dark before the tokens were raised.
        const fg = hex("--color-border-primary", mode);
        const bg = hex(surface, mode);
        expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
      });
    }

    it(`placeholder text, ${mode}`, () => {
      // A placeholder is text, so it is 4.5 rather than 3. Dark was 4.18.
      const fg = hex("--color-text-placeholder", mode);
      const bg = hex("--color-bg-primary", mode);
      expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});
