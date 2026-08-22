/**
 * The one sentence the dashboard says about movement.
 *
 * A sign flip or a lost decimal here is invisible in a screenshot review — the
 * line still reads like a sentence — and it is the only number on that screen
 * that claims a direction.
 */

import { describe, expect, it } from "vitest";
import { movementNote } from "./CardsDashboard";

describe("movementNote", () => {
  it("says nothing when there is nothing to compare against", () => {
    expect(movementNote(null)).toBeUndefined();
  });

  it("calls anything under a tenth of a percent level, in both directions", () => {
    const at = (pct: number) => movementNote({ now: 1, avg30: 1, pct, cards: 1 });
    expect(at(0.0009)).toBe("level with its 30-day average");
    expect(at(-0.0009)).toBe("level with its 30-day average");
    expect(at(0)).toBe("level with its 30-day average");
  });

  it("names the direction as a word and rounds to one decimal", () => {
    expect(movementNote({ now: 110, avg30: 100, pct: 0.1042, cards: 3 })).toBe(
      "10.4% above its 30-day average",
    );
    // The percentage is stated unsigned; "below" carries the sign.
    expect(movementNote({ now: 90, avg30: 100, pct: -0.1042, cards: 3 })).toBe(
      "10.4% below its 30-day average",
    );
  });
});
