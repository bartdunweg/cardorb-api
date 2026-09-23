import { describe, expect, it } from "vitest";
import { MARKET_MOVER_FLOOR_CENTS, marketMoversOf } from "./market-movers";
import type { CardPricePoint } from "./movers";
import { daysFromMonths } from "../price-months.mjs";

/** One day of one card, with the figures of the printings named. Euros. */
const at = (tcgId: string, date: string, printings: Record<string, number>): CardPricePoint => ({
  language: "en",
  tcgId,
  date,
  market: null,
  holo: null,
  printings,
});

const WINDOW = { from: "2026-09-15", to: "2026-09-22" };

/** A card's printing read on the window's first and last day. */
const moved = (tcgId: string, was: number, now: number, printing = "holofoil") => [
  at(tcgId, WINDOW.from, { [printing]: was }),
  at(tcgId, WINDOW.to, { [printing]: now }),
];

describe("marketMoversOf", () => {
  it("compares a printing's first reading in the window with its last", () => {
    const { up } = marketMoversOf(
      [{ tcgId: "a", printing: "holofoil" }],
      [
        at("a", "2026-09-14", { holofoil: 1 }),
        at("a", "2026-09-15", { holofoil: 10 }),
        at("a", "2026-09-18", { holofoil: 11 }),
        at("a", "2026-09-22", { holofoil: 15 }),
      ],
      WINDOW,
    );
    expect(up).toEqual([
      {
        tcgId: "a",
        printing: "holofoil",
        was: 10,
        now: 15,
        change: 5,
        pct: 0.5,
        from: "2026-09-15",
        to: "2026-09-22",
      },
    ]);
  });

  /* The rule moversOf keeps, for the reason it gives: a common that doubled is a bigger number and
     a smaller event than a Charizard that gained eight euros. */
  it("ranks by the euro change of one copy, not by percentage", () => {
    const { up } = marketMoversOf(
      [
        { tcgId: "common", printing: "holofoil" },
        { tcgId: "charizard", printing: "holofoil" },
      ],
      [...moved("common", 2, 4), ...moved("charizard", 400, 408)],
      WINDOW,
    );
    expect(up.map((m) => [m.tcgId, m.change])).toEqual([
      ["charizard", 8],
      ["common", 2],
    ]);
    expect(up[1]!.pct).toBeGreaterThan(up[0]!.pct);
  });

  it("never lets a four-cent card that doubled outrank a Charizard that gained eight euros", () => {
    const { up } = marketMoversOf(
      [
        { tcgId: "penny", printing: "normal" },
        { tcgId: "charizard", printing: "holofoil" },
      ],
      [...moved("penny", 0.04, 0.08, "normal"), ...moved("charizard", 400, 408)],
      WINDOW,
    );
    expect(up.map((m) => m.tcgId)).toEqual(["charizard"]);
  });

  /* The candidates are narrowed on this floor in Postgres (market_mover_candidates); held here to
     the same number, so a figure the stray rule held over cannot bring a penny card back in. */
  it("leaves out a printing under the floor at either end of the window", () => {
    const floor = MARKET_MOVER_FLOOR_CENTS / 100;
    const { up, down } = marketMoversOf(
      [
        { tcgId: "rose", printing: "normal" },
        { tcgId: "fell", printing: "normal" },
        { tcgId: "edge", printing: "normal" },
      ],
      [
        ...moved("rose", floor - 0.01, 30, "normal"),
        ...moved("fell", 30, floor - 0.01, "normal"),
        ...moved("edge", floor, floor + 5, "normal"),
      ],
      WINDOW,
    );
    expect(up.map((m) => m.tcgId)).toEqual(["edge"]);
    expect(down).toEqual([]);
  });

  it("splits risers from fallers, biggest move first, ten each way", () => {
    const risers = Array.from({ length: 12 }, (_, i) => moved(`up${i}`, 10, 11 + i)).flat();
    const fallers = Array.from({ length: 12 }, (_, i) => moved(`down${i}`, 100, 99 - i)).flat();
    const candidates = [
      ...Array.from({ length: 12 }, (_, i) => ({ tcgId: `up${i}`, printing: "holofoil" })),
      ...Array.from({ length: 12 }, (_, i) => ({ tcgId: `down${i}`, printing: "holofoil" })),
    ];
    const { up, down } = marketMoversOf(candidates, [...risers, ...fallers], WINDOW);
    expect(up.map((m) => m.tcgId)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((i) => `up${i}`));
    expect(down.map((m) => m.tcgId)).toEqual(
      [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((i) => `down${i}`),
    );
    expect(down.every((m) => m.change < 0)).toBe(true);
  });

  it("reads each printing of a card on its own line", () => {
    const { up, down } = marketMoversOf(
      [
        { tcgId: "a", printing: "holofoil" },
        { tcgId: "a", printing: "reverse-holofoil" },
      ],
      [
        at("a", WINDOW.from, { holofoil: 20, "reverse-holofoil": 10 }),
        at("a", WINDOW.to, { holofoil: 25, "reverse-holofoil": 7 }),
      ],
      WINDOW,
    );
    expect(up.map((m) => [m.printing, m.change])).toEqual([["holofoil", 5]]);
    expect(down.map((m) => [m.printing, m.change])).toEqual([["reverse-holofoil", -3]]);
  });

  it("is not a mover on one reading, or on a move of a few cents", () => {
    const { up, down } = marketMoversOf(
      [
        { tcgId: "once", printing: "holofoil" },
        { tcgId: "still", printing: "holofoil" },
      ],
      [at("once", WINDOW.to, { holofoil: 50 }), ...moved("still", 5, 5.05)],
      WINDOW,
    );
    expect([up, down]).toEqual([[], []]);
  });
});

/**
 * The lines the market movers read are laid out by daysFromMonths, the same as every chart and the
 * per-person movers: a figure one odd sale set is held over with the printing's figure before it
 * (dropStrayFigures, holdLastFigure). So it cannot make a mover here either.
 */
describe("a stray figure", () => {
  /** A month row of cents, every day from `first` to `last` at `cents`, with `odd` days overridden. */
  const row = (
    month: string,
    first: number,
    last: number,
    cents: number,
    odd: Record<number, number> = {},
  ) => ({
    language: "en" as const,
    tcg_id: "sv1-1",
    printing: "holofoil",
    month,
    cents: Array.from({ length: 31 }, (_, i) =>
      i + 1 < first || i + 1 > last ? null : (odd[i + 1] ?? cents),
    ),
  });

  const candidates = [{ tcgId: "sv1-1", printing: "holofoil" }];

  it("at the end of the window is held with the figure before it, and moves nothing", () => {
    const lines = daysFromMonths(
      [row("2026-08-01", 1, 31, 200), row("2026-09-01", 1, 22, 200, { 22: 4000 })],
      "2026-08-01",
    );
    expect(marketMoversOf(candidates, lines, WINDOW)).toEqual({ up: [], down: [] });
  });

  it("at the start of the window is held too, so it makes no faller", () => {
    const lines = daysFromMonths(
      [row("2026-08-01", 1, 31, 200), row("2026-09-01", 1, 22, 200, { 15: 4000 })],
      "2026-08-01",
    );
    expect(marketMoversOf(candidates, lines, WINDOW)).toEqual({ up: [], down: [] });
  });

  it("is a mover read raw, which is what the filtering is for", () => {
    const raw = [
      at("sv1-1", WINDOW.from, { holofoil: 2 }),
      at("sv1-1", WINDOW.to, { holofoil: 40 }),
    ];
    expect(marketMoversOf(candidates, raw, WINDOW).up).toHaveLength(1);
  });

  it("is not a real move of a week's standing, which still reads as one", () => {
    // A new level held seven days at the end of the line is its price (STRAY_SETTLED_FIGURES).
    const odd = Object.fromEntries([16, 17, 18, 19, 20, 21, 22].map((d) => [d, 4000]));
    const lines = daysFromMonths(
      [row("2026-08-01", 1, 31, 200), row("2026-09-01", 1, 22, 200, odd)],
      "2026-08-01",
    );
    expect(marketMoversOf(candidates, lines, WINDOW).up.map((m) => [m.was, m.now])).toEqual([
      [2, 40],
    ]);
  });
});
