import { describe, expect, it } from "vitest";
import {
  matchScrydexCards,
  parseCardPage,
  parseExpansionTable,
  scrydexExpansionFor,
} from "./scrydex-japan-cards.mjs";

const attr = (data: unknown) =>
  `<div data-terminal-trigger-json-value="${JSON.stringify(data)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")}"></div>`;

describe("parseCardPage", () => {
  it("keeps the printed name, the mark, the artist and the English evolution, not the prices", () => {
    const page = attr({
      data: {
        id: "sv4a_ja-349",
        name: "リザードンex",
        number: "349",
        printed_number: "349/190",
        rarity: "スペシャルアートレア",
        rarity_code: "SAR",
        artist: "AKIRA EGAWA",
        hp: "330",
        national_pokedex_numbers: [6],
        translation: {
          en: {
            name: "Charizard ex",
            supertype: "Pokémon",
            subtypes: ["Stage 2", "ex", "Tera"],
            types: ["Darkness"],
            evolves_from: ["Charmeleon"],
            rarity: "Special Art Rare",
          },
        },
        variants: [{ name: "holofoil", prices: [{ market: 225.82 }] }],
      },
    });
    expect(parseCardPage(`<html>${page}</html>`)).toEqual({
      name: "リザードンex",
      number: "349",
      printed: "349/190",
      mark: "SAR",
      artist: "AKIRA EGAWA",
      hp: 330,
      dex: [6],
      en: {
        name: "Charizard ex",
        supertype: "Pokémon",
        subtypes: ["Stage 2", "ex", "Tera"],
        types: ["Darkness"],
        evolvesFrom: ["Charmeleon"],
        rarity: "Special Art Rare",
      },
    });
  });

  it("is null for a page without the card's JSON", () => {
    expect(parseCardPage("<html></html>")).toBeNull();
  });
});

describe("parseExpansionTable", () => {
  it("reads number, English name and mark off the table view, once per card", () => {
    const row = (slug: string, n: string, name: string, mark: string) =>
      `<tr class="group" data-action="click->view-mode#navigateToCard" data-url="/pokemon/cards/${slug}/sv4a_ja-${n}?variant=firstEdition"><td><span class="a">${name}</span></td><td><span>${n}</span></td><td><span>${mark}</span></td></tr>`;
    const page = `<div data-view-mode-target="table"><table><tbody>${row("oddish", "1", "Oddish", "\u2014")}${row("pikachu", "236", "Pikachu", "Shiny Rare")}${row("pikachu", "236", "Pikachu", "Shiny Rare")}${row("brocks", "7", "Brock&#39;s Zubat", "C")}</tbody></table>`;
    expect(parseExpansionTable(page, "sv4a_ja")).toEqual([
      { number: "1", name: "Oddish", mark: "none" },
      { number: "236", name: "Pikachu", mark: "Shiny Rare" },
      { number: "7", name: "Brock's Zubat", mark: "C" },
    ]);
  });
});

describe("scrydexExpansionFor", () => {
  const expansions = [
    { name: "Facing a New Trial", code: "sm2p_ja" },
    { name: "Red Flash", code: "xy8r_ja" },
    { name: "Blue Shock", code: "xy8b_ja" },
  ];
  it("finds a set by hand, by id and by title", () => {
    expect(scrydexExpansionFor(expansions, { id: "XY8b", name: "Red Flash" })?.code).toBe(
      "xy8r_ja",
    );
    expect(scrydexExpansionFor(expansions, { id: "XY8a", name: "Blue Shock" })?.code).toBe(
      "xy8b_ja",
    );
    expect(
      scrydexExpansionFor(expansions, { id: "SM2p", name: "Beyond a New Challenge" })?.code,
    ).toBe("sm2p_ja");
  });
});

describe("matchScrydexCards", () => {
  const scrydex = (rows: [string, string, string?][]) =>
    rows.map(([number, name, localName]) => ({ number, name, localName: localName ?? null }));

  it("takes a number where the names agree, one holding the other", () => {
    const got = matchScrydexCards(
      scrydex([
        ["62", "Mewtwo-EX"],
        ["63", "M Mewtwo-EX"],
      ]),
      [
        { id: "XY8a-062", number: "062", name: "Mewtwo EX" },
        { id: "XY8a-063", number: "063", name: "Mewtwo" },
      ],
    );
    expect([...got]).toEqual([
      ["XY8a-062", "62"],
      ["XY8a-063", "63"],
    ]);
  });

  it("takes a card named only in Japanese by its printed name, or by number where the set agrees", () => {
    const named = ["Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon"].map((n, i) => [
      String(i + 1),
      n,
    ]) as [string, string][];
    const got = matchScrydexCards(
      scrydex([...named, ["6", "Heal Powder", "ばんのうごな"], ["7", "Magnifier", "ピントレンズ"]]),
      [
        ...named.map(([n, name]) => ({ id: `neo4-00${n}`, number: `00${n}`, name })),
        { id: "neo4-006", number: "006", name: "粉末を癒します" },
        { id: "neo4-099", number: "099", name: "拡大鏡", localName: "ピントレンズ" },
      ],
    );
    expect(got.get("neo4-006")).toBe("6");
    expect(got.get("neo4-099")).toBe("7");
  });

  it("does not take a number whose card is another where the set numbers its own way", () => {
    const got = matchScrydexCards(
      scrydex([
        ["25", "Unown [F]"],
        ["26", "Unown [D]"],
      ]),
      [{ id: "neo2-025", number: "025", name: "Unown D" }],
    );
    expect(got.get("neo2-025")).toBe("26");
  });
});
