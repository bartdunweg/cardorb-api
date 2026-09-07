import { describe, expect, it } from "vitest";
import { eraLabel, eraYears, groupByEra } from "./eras";
import type { CardSet, OwnedCard } from "../collection/cards";

const card = (over: Partial<OwnedCard> = {}): OwnedCard => ({
  key: "k",
  name: "Pikachu",
  number: "088",
  type: null,
  gen: "Base",
  image: null,
  imageHigh: null,
  imageSize: null,
  speciesId: null,
  variants: [],
  owned: true,
  price: null,
  priceHolo: null,
  tcgId: null,
  ...over,
});

const set = (name: string, releaseDate: string | null, cards: OwnedCard[]): CardSet => ({
  name,
  // What the catalogue calls it, falling back to what its owner does. Not what
  // this module groups by — the era is voted on by the cards — but required on
  // the type, and the fallback is the honest default for a set nobody indexed.
  title: name,
  abbreviation: null,
  logo: null,
  logoSize: null,
  releaseDate,
  total: null,
  cards,
});

describe("groupByEra", () => {
  it("files a set under the era most of its cards claim", () => {
    // A vote rather than a lookup: the era is recorded per card by hand, and a
    // few rows disagreeing with the rest should not move the whole set away
    // from the sets it sits beside in a binder.
    const groups = groupByEra([
      set("Base", "1999-01-09", [card(), card(), card({ gen: "Jungle" })]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.era).toBe("Base");
  });

  it("puts the newest era first, and the newest set inside it", () => {
    const groups = groupByEra([
      set("Base", "1999-01-09", [card()]),
      set("Obsidian Flames", "2023-08-11", [card({ gen: "Scarlet & Violet" })]),
      set("Paldea Evolved", "2023-06-09", [card({ gen: "Scarlet & Violet" })]),
    ]);
    expect(groups.map((g) => g.era)).toEqual(["Scarlet & Violet", "Base"]);
    expect(groups[0]!.sets.map((s) => s.name)).toEqual(["Obsidian Flames", "Paldea Evolved"]);
  });

  it("sorts an era nobody dated to the end rather than the front", () => {
    const groups = groupByEra([
      set("Nowhere", null, [card({ gen: "Unknown" })]),
      set("Base", "1999-01-09", [card()]),
    ]);
    expect(groups.map((g) => g.era)).toEqual(["Base", "Unknown"]);
  });

  it("calls an era nothing claims 'Other' instead of dropping the set", () => {
    // A set whose cards have no era recorded is still a set somebody owns.
    const groups = groupByEra([set("Loose", "2020-01-01", [card({ gen: null })])]);
    expect(groups[0]!.era).toBe("Other");
    expect(groups[0]!.sets[0]!.name).toBe("Loose");
  });
});

describe("eraLabel", () => {
  it("shows one year where an era spans one", () => {
    const years = eraYears([set("Base", "1999-01-09", [card()])]);
    expect(eraLabel("Base", years)).toBe("Base (1999)");
  });

  it("shows the range where it spans more", () => {
    const years = eraYears([
      set("Base", "1999-01-09", [card()]),
      set("Fossil", "2000-10-10", [card()]),
    ]);
    expect(eraLabel("Base", years)).toBe("Base (1999–2000)");
  });

  it("leaves an undated era as its bare name", () => {
    expect(eraLabel("Unknown", new Map())).toBe("Unknown");
  });
});
