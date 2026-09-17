import { describe, expect, it } from "vitest";
import {
  dayOf,
  groupTitle,
  groupsOfSets,
  scrydexExpansions,
  setFactsAgainst,
} from "./set-facts-rules.mjs";

/** Two rows of Scrydex's table as the page served them on 2026-09-17, classes trimmed. */
const TABLE =
  '<tr data-action="click->view-mode#navigateToCard" data-url="/pokemon/expansions/30th-celebration-classic-collection/me55c"><td class="x"><div class="y"><div class="z"><img src="logo" /></div><span class="n">30th Celebration: Classic Collection</span></div></td><td class="c"><span class="c">me55c</span></td><td><span>30</span></td><td><span>2026/09/16</span></td></tr>' +
  '<tr data-action="click->view-mode#navigateToCard" data-url="/pokemon/expansions/team-up/sm9"><td><div><div><img src="logo" /></div><span>Team Up</span></div></td><td><span>sm9</span></td><td><span>198</span></td><td><span>2019/02/01</span></td></tr>' +
  '<tr data-url="/pokemon/expansions/tag-bolt/sm9_ja"><td><div><div><img src="logo" /></div><span>Tag Bolt</span></div></td><td><span>sm9_ja</span></td><td><span>95</span></td><td><span>2018/12/07</span></td></tr>';

describe("scrydexExpansions", () => {
  it("reads each English row's code, name and date", () => {
    expect(scrydexExpansions(TABLE)).toEqual([
      { code: "me55c", name: "30th Celebration: Classic Collection", date: "2026-09-16" },
      { code: "sm9", name: "Team Up", date: "2019-02-01" },
    ]);
  });
});

describe("setFactsAgainst", () => {
  const teamUp = { name: "SM09: Team Up", publishedOn: "2019-02-01T00:00:00" };
  const scrydex = { name: "Team Up", date: "2019-02-01" };

  it("flags a date TCGplayer and Scrydex agree on against the copy", () => {
    // Team Up, as TCGdex dated it (Bulbapedia: February 1, 2019).
    expect(
      setFactsAgainst({ name: "Team Up", release_date: "2019/01/31" }, teamUp, scrydex),
    ).toEqual({ date: ["2019/01/31", "2019-02-01"] });
    expect(
      setFactsAgainst({ name: "Team Up", release_date: "2019/02/01" }, teamUp, scrydex),
    ).toEqual({});
  });

  it("flags a name both write otherwise, punctuation and case aside", () => {
    expect(
      setFactsAgainst(
        { name: "Mega Evolution Energy", release_date: "2025/09/26" },
        { name: "MEE: Mega Evolution Energies", publishedOn: "2025-09-26T00:00:00" },
        { name: "Mega Evolution Energies", date: "2025-09-26" },
      ),
    ).toEqual({ name: ["Mega Evolution Energy", "Mega Evolution Energies"] });
    expect(
      setFactsAgainst(
        { name: "Pokémon GO", release_date: "2022/07/01" },
        { name: "SWSH10.5: Pokemon GO", publishedOn: "2022-07-01T00:00:00" },
        { name: "Pokemon GO", date: "2022-07-01" },
      ),
    ).toEqual({});
  });

  it("leaves the copy alone where the two disagree with each other, or one has no answer", () => {
    expect(
      setFactsAgainst(
        { name: "Team Up", release_date: "2019/01/31" },
        { ...teamUp, publishedOn: "2019-01-25T00:00:00" },
        scrydex,
      ),
    ).toEqual({});
    expect(
      setFactsAgainst({ name: "Team Up", release_date: "2019/01/31" }, teamUp, undefined),
    ).toEqual({});
  });
});

describe("groupsOfSets and the small readers", () => {
  it("files a set under the group most of its linked cards are in", () => {
    expect(
      groupsOfSets(
        {
          "sm9-1": { productId: 1 },
          "sm9-2": { productId: 2 },
          "sm9-3": { productId: 3, groupId: 99 },
          "tk-ex-p-7": { productId: 4 },
          "sm9-4": null,
        },
        { 1: 2377, 2: 2377, 4: 10 },
      ),
    ).toEqual(
      new Map([
        ["sm9", 2377],
        ["tk-ex-p", 10],
      ]),
    );
    expect(groupTitle("ME: 30th Celebration")).toBe("30th Celebration");
    expect(dayOf("2019/01/31")).toBe("2019-01-31");
  });
});
