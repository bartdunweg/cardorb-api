import { describe, expect, it } from "vitest";
import REVERSE_HOLO from "./reverse-holo.generated.json";
import {
  beforeReverseHolos,
  decideSet,
  disjointFinishesBySet,
  energyKinds,
  undecidedLinkedCards,
} from "./reverse-holo-rules.mjs";

type Vote = boolean | null;
const card = (setId: string, localId: string, name: string, rarity = "Common") => ({
  id: `${setId}-${localId}`,
  set_id: setId,
  local_id: localId,
  name,
  rarity,
});
const row = (c: ReturnType<typeof card>, tcgdex: Vote, tcgplayer: Vote, scrydex: Vote) => ({
  card: c,
  tcgdex,
  tcgplayer,
  scrydex,
});
const general = () => ({ has: true, rule: "every card but Ultra Rares" });
const committed = REVERSE_HOLO as unknown as {
  sets: Record<string, { bulbapedia: string | null; energyExceptions?: string[] }>;
  holoBeforeReverses: string[];
  cards: Record<string, boolean>;
};

/**
 * Reverse holos began with Legendary Collection (24 May 2002; Bulbapedia, "Holofoil": "Legendary
 * Collection was the first set to include Reverse Holographic cards").
 */
describe("the era rule", () => {
  it("gives no card sold before Legendary Collection a plain reverse, whatever the witnesses say", () => {
    // Southern Islands Mew: TCGdex files it as a reverse, TCGplayer as "Reverse Holofoil"; it is a holo.
    const mew = card("si1", "1", "Mew");
    expect(beforeReverseHolos(mew, "2001/07/31")).toBe(true);
    expect(beforeReverseHolos(card("lc", "1", "Alakazam"), "2002/05/24")).toBe(false);
    const { decisions, era } = decideSet([row(mew, true, true, false)], {
      released: "2001/07/31",
      bulbapedia: () => null,
    });
    expect(era).toBe(true);
    expect(decisions["si1-1"]).toBe(false);
  });

  it("reads Wizards Black Star Promos per card: to number 46, May 2002", () => {
    expect(beforeReverseHolos(card("basep", "34", "Entei"), "1999/07/01")).toBe(true);
    expect(beforeReverseHolos(card("basep", "47", "Aerodactyl"), "1999/07/01")).toBe(false);
  });

  it("holds in the committed decisions", () => {
    const eraSets = Object.entries(committed.sets).filter(([, s]) =>
      s.bulbapedia?.startsWith("none: sold before"),
    );
    expect(eraSets.map(([id]) => id)).toEqual(
      expect.arrayContaining(["base1", "neo4", "si1", "gym1", "basep"]),
    );
    for (const [setId] of eraSets.filter(([id]) => id !== "basep"))
      for (const [id, has] of Object.entries(committed.cards))
        if (id.startsWith(`${setId}-`)) expect(has, id).toBe(false);
    for (const n of [33, 34, 35]) expect(committed.cards[`basep-${n}`]).toBe(false);
    expect(committed.holoBeforeReverses).toContain("si1-1");
  });
});

describe("basic Energy decided as one kind", () => {
  const energies = [
    "Grass",
    "Fire",
    "Water",
    "Lightning",
    "Psychic",
    "Fighting",
    "Darkness",
    "Metal",
  ];

  // Diamond & Pearl, 2026-09-14: TCGdex no on all eight; TCGplayer yes on Fighting and Darkness,
  // Scrydex yes on Fire, Darkness and Metal. Taken card by card, Darkness had a reverse and the rest
  // did not.
  it("does not split a set's basic Energies on noisy witnesses", () => {
    const votes: Record<string, [Vote, Vote, Vote]> = {
      Fire: [false, false, true],
      Fighting: [false, true, false],
      Darkness: [false, true, true],
      Metal: [false, false, true],
    };
    const rows = energies.map((e, i) =>
      row(card("dp1", String(123 + i), `${e} Energy`), ...(votes[e] ?? [false, false, false])),
    );
    const { decisions, exceptions } = decideSet(rows, { bulbapedia: general });
    expect(new Set(Object.values(decisions))).toEqual(new Set([false]));
    expect(exceptions).toEqual([]);
  });

  it("lets a card leave its kind only where every witness, at least two, says so", () => {
    // Power Keepers: Darkness and Metal Energy (Rare) with a reverse on TCGplayer and Scrydex, beside
    // six Rare basics with none.
    const rows = [
      row(card("ex16", "87", "Darkness Energy", "Rare"), null, true, true),
      row(card("ex16", "88", "Metal Energy", "Rare"), null, true, true),
      ...energies
        .slice(0, 6)
        .map((e, i) =>
          row(card("ex16", String(103 + i), `${e} Energy`, "Rare"), null, false, false),
        ),
    ];
    const { decisions, exceptions } = decideSet(rows, { bulbapedia: general });
    expect(exceptions).toEqual(["ex16-87", "ex16-88"]);
    expect(decisions["ex16-103"]).toBe(false);
    // One witness alone moves nothing.
    const lone = decideSet(
      [row(card("hgss1", "117", "Water Energy"), false, false, true), ...rows.slice(2)],
      { bulbapedia: general },
    );
    expect(lone.decisions["hgss1-117"]).toBe(false);
  });

  it("keeps a rarity or a repeated run of names a kind of its own", () => {
    const kinds = energyKinds([
      card("sve", "001", "Grass Energy"),
      card("sve", "009", "Grass Energy"),
      card("ex9", "86", "Darkness Energy", "Rare"),
      card("ex9", "101", "Grass Energy", "Holo Rare"),
    ]);
    expect(kinds.get("sve-001")).not.toBe(kinds.get("sve-009"));
    expect(kinds.get("ex9-86")).not.toBe(kinds.get("ex9-101"));
  });

  it("holds in the committed decisions for Diamond & Pearl and HeartGold SoulSilver", () => {
    for (const [setId, from] of [
      ["dp1", 123],
      ["hgss1", 115],
    ] as const) {
      const decided = new Set(
        Array.from({ length: 8 }, (_, i) => committed.cards[`${setId}-${from + i}`]),
      );
      expect(decided, setId).toEqual(new Set([false]));
      expect(committed.sets[setId]?.energyExceptions).toBeUndefined();
    }
  });
});

describe("undecidedLinkedCards", () => {
  const cards = [
    { id: "30th-c-001", set_id: "30th-c" },
    { id: "30th-c-002", set_id: "30th-c" },
    { id: "base1-4", set_id: "base1" },
    { id: "lc-64", set_id: "lc" },
    { id: "tk-x-1", set_id: "tk-x" },
  ];
  const links = {
    "30th-c-001": { productId: 714372 },
    "30th-c-002": { productId: 714373 },
    "base1-4": { productId: 42382 },
    "lc-64": { productId: 1 },
    "tk-x-1": null,
  };

  it("counts a linked card the run never decided, per set", () => {
    expect(undecidedLinkedCards(cards, links, { "base1-4": false }, new Set(["lc-64"]))).toEqual(
      new Map([["30th-c", 2]]),
    );
  });
});

describe("disjointFinishesBySet", () => {
  const normal = [{ type: "normal" }];
  const holofoil = { variants: ["holofoil"] };

  it("fails a set TCGdex files as normal where TCGplayer sells every card as a holo, until decided", () => {
    const cards = ["001", "002"].map((n) => ({
      id: `30th-${n}`,
      set_id: "30th",
      variants: normal,
    }));
    const links = { "30th-001": holofoil, "30th-002": holofoil };
    expect(disjointFinishesBySet(cards, links, {}).get("30th")).toEqual({
      compared: 2,
      disjoint: ["30th-001", "30th-002"],
    });
    expect(
      disjointFinishesBySet(cards, links, { holoNotNormal: ["30th-001", "30th-002"] }).get("30th"),
    ).toEqual({ compared: 2, disjoint: [] });
  });

  it("reads a run's printings as their finish and skips a card either side names none for", () => {
    const cards = [
      { id: "base1-4", set_id: "base1", variants: [{ type: "holo" }] },
      { id: "base1-58", set_id: "base1", variants: normal },
      { id: "tk-x-1", set_id: "tk-x", variants: [] },
    ];
    const links = {
      "base1-4": { variants: ["1st-edition-holofoil", "unlimited-holofoil"] },
      "base1-58": { variants: ["1st-edition", "unlimited"] },
      "tk-x-1": holofoil,
    };
    expect(disjointFinishesBySet(cards, links, {})).toEqual(
      new Map([["base1", { compared: 2, disjoint: [] }]]),
    );
  });

  it("reads a plain card TCGdex files as a holo as the plain card the witnesses name", () => {
    const cards = [{ id: "fut2020-1", set_id: "fut2020", variants: [{ type: "holo" }] }];
    const links = { "fut2020-1": { variants: ["normal"] } };
    expect(disjointFinishesBySet(cards, links, {}).get("fut2020")?.disjoint).toEqual(["fut2020-1"]);
    expect(
      disjointFinishesBySet(cards, links, { normalNotHolo: ["fut2020-1"] }).get("fut2020")
        ?.disjoint,
    ).toEqual([]);
  });

  it("holds every 30th Celebration and Classic Collection card to TCGplayer's holofoil", () => {
    const decided = committed as unknown as { holoNotNormal: string[] };
    for (const setId of ["30th", "30th-c"])
      expect(committed.sets[setId]?.bulbapedia, setId).toBe("none: every card is holofoil");
    expect(decided.holoNotNormal.filter((id) => /^30th-(c-)?\d/.test(id))).toHaveLength(188);
  });
});
