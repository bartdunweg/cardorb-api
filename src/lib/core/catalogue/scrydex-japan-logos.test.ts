import { describe, expect, it } from "vitest";
import {
  parseExpansionCards,
  parseExpansions,
  scrydexLogoFor,
  scrydexNumbers,
} from "./scrydex-japan-logos";

const page = `
  <a data-name="Pokémon Card 151" class="x" href="/pokemon/expansions/pokmon-card-151/sv2a_ja">
  <a data-name="Shiny Star V" class="x" href="/pokemon/expansions/shiny-star-v/swsh4a_ja">
  <a data-name="Peerless Fighters" class="x" href="/pokemon/expansions/peerless-fighters/swsh5a_ja">
  <a data-name="Leaders&#39; Stadium" class="x" href="/pokemon/expansions/leaders-stadium/gym1_ja">
  <a data-name="Shiny Star V" class="x" href="/pokemon/expansions/shiny-star-v/swsh4a_ja">
`;

describe("parseExpansions", () => {
  it("reads each expansion once, its name unescaped", () => {
    expect(parseExpansions(page)).toEqual([
      { name: "Pokémon Card 151", code: "sv2a_ja", slug: "pokmon-card-151" },
      { name: "Shiny Star V", code: "swsh4a_ja", slug: "shiny-star-v" },
      { name: "Peerless Fighters", code: "swsh5a_ja", slug: "peerless-fighters" },
      { name: "Leaders' Stadium", code: "gym1_ja", slug: "leaders-stadium" },
    ]);
  });
});

describe("scrydexLogoFor", () => {
  const expansions = parseExpansions(page);
  const logo = (code: string) => `https://images.scrydex.com/pokemon/${code}-logo/logo`;

  it("finds a set by its id", () => {
    expect(scrydexLogoFor(expansions, { id: "SV2a", name: "Pokémon Card 151" })).toBe(
      logo("sv2a_ja"),
    );
  });

  it("finds a set Scrydex codes its own way by its English title", () => {
    expect(scrydexLogoFor(expansions, { id: "S4a", name: "Shiny Star V" })).toBe(logo("swsh4a_ja"));
    expect(scrydexLogoFor(expansions, { id: "PMCG5", name: "Leaders' Stadium" })).toBe(
      logo("gym1_ja"),
    );
  });

  it("uses the hand-read code where Scrydex titles a set differently", () => {
    expect(scrydexLogoFor(expansions, { id: "S5a", name: "Matchless Fighters" })).toBe(
      logo("swsh5a_ja"),
    );
  });

  it("is null for a set Scrydex does not list", () => {
    expect(
      scrydexLogoFor(expansions, { id: "SVLN", name: "Starter Set Tera Type: Stellar Sylveon ex" }),
    ).toBeNull();
  });
});

describe("parseExpansionCards", () => {
  it("reads each numbered card once, its name folded", () => {
    const page = `
      <a href="/pokemon/cards/brocks-zubat/gym1_ja-1?variant=holo">
      <a href="/pokemon/cards/brocks-zubat/gym1_ja-1">
      <a href="/pokemon/cards/erikas-oddish/gym1_ja-2">
      <a href="/pokemon/cards/other/gym2_ja-3">`;
    expect(parseExpansionCards(page, "gym1_ja")).toEqual([
      { number: "1", name: "brockszubat" },
      { number: "2", name: "erikasoddish" },
    ]);
  });
});

describe("scrydexNumbers", () => {
  const scrydex = (...names: string[]) => names.map((name, i) => ({ number: String(i + 1), name }));

  it("takes a number where Scrydex's name contains the copy's", () => {
    const got = scrydexNumbers(scrydex("brockszubat", "erikasoddish"), [
      { id: "PMCG5-001", number: "001", name: "Zubat" },
      { id: "PMCG5-002", number: "002", name: "Oddish Oddish" },
    ]);
    expect([...got]).toEqual([
      ["PMCG5-001", "1"],
      ["PMCG5-002", "2"],
    ]);
  });

  it("finds a card by its name where Scrydex numbers the set its own way", () => {
    const got = scrydexNumbers(scrydex("oddish", "chikorita", "bayleef"), [
      { id: "neo1-009", number: "009", name: "Bayleef Bayleef" },
    ]);
    expect(got.get("neo1-009")).toBe("3");
  });

  it("takes an unnamed card by number only where the set's numbering agrees", () => {
    const named = ["a", "b", "c", "d", "e"].map((n, i) => ({
      id: `X-${i + 1}`,
      number: String(i + 1),
      name: n.repeat(4),
    }));
    const unnamed = { id: "X-6", number: "6", name: "リザードン" };
    const agreeing = scrydexNumbers(scrydex("aaaa", "bbbb", "cccc", "dddd", "eeee", "charizard"), [
      ...named,
      unnamed,
    ]);
    expect(agreeing.get("X-6")).toBe("6");
    const disagreeing = scrydexNumbers(scrydex("zz", "yy", "xx", "ww", "vv", "charizard"), [
      ...named,
      unnamed,
    ]);
    expect(disagreeing.get("X-6")).toBeUndefined();
  });
});
