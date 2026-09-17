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
  const sm9 = { id: "sm9", serie_id: "sm" };

  it("flags a date a majority of the sources write otherwise", () => {
    // Team Up, as TCGdex dated it (Bulbapedia: February 1, 2019).
    const off = setFactsAgainst(
      { ...sm9, name: "Team Up", release_date: "2019/01/31" },
      teamUp,
      scrydex,
    );
    expect(off.date?.stored).toBe("2019/01/31");
    expect(off.date?.value).toBe("2019-02-01");
    expect(off.date?.why).toContain("TCGplayer and Scrydex");
    expect(
      setFactsAgainst({ ...sm9, name: "Team Up", release_date: "2019/02/01" }, teamUp, scrydex),
    ).toEqual({});
  });

  it("flags a name the majority writes otherwise, punctuation and case aside", () => {
    const off = setFactsAgainst(
      { id: "me5", serie_id: "me", name: "Mega Evolution Energy", release_date: "2025/09/26" },
      { name: "MEE: Mega Evolution Energies", publishedOn: "2025-09-26T00:00:00" },
      { name: "Mega Evolution Energies", date: "2025-09-26" },
    );
    expect(off.name?.value).toBe("Mega Evolution Energies");
    expect(
      setFactsAgainst(
        { id: "swsh10.5", serie_id: "swsh", name: "Pokémon GO", release_date: "2022/07/01" },
        { name: "SWSH10.5: Pokemon GO", publishedOn: "2022-07-01T00:00:00" },
        { name: "Pokemon GO", date: "2022-07-01" },
      ),
    ).toEqual({});
  });

  it("writes a subset the way the copy always has, with no store colon", () => {
    const off = setFactsAgainst(
      { id: "30th-c", serie_id: "me", name: "30th Classic Collection", release_date: "2026/09/16" },
      { name: "ME: 30th Celebration: Classic Collection", publishedOn: "2026-09-16T00:00:00" },
      { name: "30th Celebration: Classic Collection", date: "2026-09-16" },
      { tcgdex: { name: "30th Classic Collection", releaseDate: "2026-09-16" } },
    );
    expect(off.name?.value).toBe("30th Celebration Classic Collection");
  });

  it("leaves the copy alone where the sources are split, or nobody answers", () => {
    expect(
      setFactsAgainst({ ...sm9, name: "Team Up", release_date: "2019/01/31" }, teamUp, {
        ...scrydex,
        date: "2019-01-25",
      }).date,
    ).toBeUndefined();
    expect(
      setFactsAgainst({ ...sm9, name: "Team Up", release_date: "2019/01/31" }, teamUp, undefined),
    ).toEqual({});
  });

  it("keeps Bulbapedia's day against the month placeholders the rest carry", () => {
    // EX Team Rocket Returns: November 8, 2004 on Bulbapedia, the first of the month elsewhere.
    expect(
      setFactsAgainst(
        { id: "ex7", serie_id: "ex", name: "EX Team Rocket Returns", release_date: "2004/11/08" },
        { name: "EX Team Rocket Returns", publishedOn: "2004-11-01T00:00:00" },
        { name: "Team Rocket Returns", date: "2004-11-01" },
        { tcgdex: { releaseDate: "2004-11-01" }, bulbapediaDate: "2004/11/08" },
      ),
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
