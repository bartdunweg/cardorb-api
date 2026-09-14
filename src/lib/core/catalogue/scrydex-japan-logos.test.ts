import { describe, expect, it } from "vitest";
import { parseExpansions, scrydexLogoFor } from "./scrydex-japan-logos";

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
      { name: "Pokémon Card 151", code: "sv2a_ja" },
      { name: "Shiny Star V", code: "swsh4a_ja" },
      { name: "Peerless Fighters", code: "swsh5a_ja" },
      { name: "Leaders' Stadium", code: "gym1_ja" },
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
