import { describe, expect, it } from "vitest";
import {
  EXCEPTIONS,
  FIELDS,
  HOLO_THROUGHOUT,
  SOURCES,
  exceptionsFor,
  explain,
  resolve,
  subsetName,
} from "./consensus.mjs";

describe("the declarations", () => {
  it("names a real source and a real field in every exception", () => {
    for (const e of EXCEPTIONS) {
      expect(FIELDS, `exception on ${e.field}`).toHaveProperty(e.field);
      expect(SOURCES, `exception by ${e.source}`).toHaveProperty(e.source);
      const declared = FIELDS[e.field as keyof typeof FIELDS] as { voters: Record<string, number> };
      expect(Object.keys(declared.voters), `${e.source} votes on ${e.field}`).toContain(e.source);
    }
  });

  it("gives every exception a reason and the day it was written", () => {
    for (const e of EXCEPTIONS) {
      expect(e.why.length, `${e.field} / ${e.source}`).toBeGreaterThan(20);
      expect(e.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("lets every field's voters be sources", () => {
    for (const [field, declared] of Object.entries(FIELDS) as [
      string,
      { voters: Record<string, number>; held: string },
    ][])
      for (const [source, weight] of Object.entries(declared.voters)) {
        expect(SOURCES, `${field} voter`).toHaveProperty(source);
        expect(weight).toBeGreaterThan(0);
      }
  });
});

describe("resolve", () => {
  const set = { setId: "sm9", series: "sm" };

  it("takes the majority and says who gave it", () => {
    const r = resolve("set.name", set, {
      tcgdex: "Team Upp",
      tcgplayer: "Team Up",
      scrydex: "Team Up",
    });
    expect(r.outcome).toBe("majority");
    expect(r.value).toBe("Team Up");
    expect(r.winners).toEqual(["tcgplayer", "scrydex"]);
  });

  it("changes nothing on a tie, and reports what each source said", () => {
    const r = resolve("set.name", set, { tcgdex: "Team Upp", tcgplayer: "Team Up" });
    expect(r.outcome).toBe("tie");
    expect(r.value).toBeNull();
    expect(explain(r)).toContain('TCGdex "Team Upp"');
    expect(explain(r)).toContain("no majority, nothing changed");
  });

  it("changes nothing where every source says something else", () => {
    expect(
      resolve("set.name", set, { tcgdex: "One", tcgplayer: "Two", scrydex: "Three" }).outcome,
    ).toBe("tie");
  });

  it("lets one source decide where its field asks for no second witness", () => {
    const r = resolve("card.illustrator", set, { tcgdex: "Mitsuhiro Arita" });
    expect(r.outcome).toBe("agreed");
    expect(r.value).toBe("Mitsuhiro Arita");
  });

  it("changes nothing where a field's quorum was not heard", () => {
    const r = resolve("set.name", set, { tcgplayer: "Team Up" });
    expect(r.outcome).toBe("short");
    expect(r.value).toBeNull();
    expect(explain(r)).toContain("one source only, nothing changed");
  });

  it("counts an excused source towards the quorum", () => {
    // Yellow A Alternate: TCGdex says plain for a set TCGplayer sells as holofoil, and Scrydex
    // files its cards under their parent sets, so TCGplayer is the only vote left standing.
    const r = resolve(
      "card.holo",
      { setId: "xya", cardId: "xya-107a" },
      {
        tcgdex: false,
        tcgplayer: true,
      },
    );
    expect(r.outcome).toBe("agreed");
    expect(r.value).toBe(true);
    expect(resolve("card.holo", { setId: "xya" }, { tcgplayer: true }).outcome).toBe("short");
  });

  it("says nothing where nobody answers", () => {
    expect(resolve("set.name", set, {}).outcome).toBe("silent");
  });

  it("takes a source's vote away where an exception is declared, and names the reason", () => {
    const values = { tcgdex: false, tcgplayer: true };
    const open = resolve("card.holo", { setId: "sm9" }, values);
    expect(open.outcome).toBe("tie");
    const excused = resolve("card.holo", { setId: "30th" }, values);
    expect(excused.outcome).toBe("agreed");
    expect(excused.value).toBe(true);
    expect(excused.excused[0]?.source).toBe("tcgdex");
    expect(explain(excused)).toContain("TCGdex does not vote");
  });

  it("counts a source that copies another only once", () => {
    const both = resolve("card.image", {}, { scrydex: "a.png", pokemontcg: "a.png" });
    expect(both.folded).toEqual([{ source: "pokemontcg", copies: "scrydex" }]);
    expect(both.tally[0]?.sources).toEqual(["scrydex"]);
    // Silent Scrydex leaves pokemontcg.io its own vote.
    expect(resolve("card.image", {}, { pokemontcg: "a.png" }).winners).toEqual(["pokemontcg"]);
  });

  it("weighs a source as its field declares", () => {
    // Bulbapedia counts twice on a release day, so it outvotes Scrydex alone.
    const r = resolve(
      "set.releaseDate",
      { series: "sm" },
      { bulbapedia: "2004-11-08", scrydex: "2004-11-01" },
    );
    expect(r.value).toBe("2004-11-08");
  });

  it("refuses a field nobody declared", () => {
    expect(() => resolve("card.smell", {}, {})).toThrow(/No consensus field/);
  });
});

describe("the declared biases", () => {
  it("keeps TCGdex's and Scrydex's month placeholder out of a pre-Black & White date", () => {
    // EX Team Rocket Returns: Bulbapedia November 8, 2004; the rest the first of the month.
    const r = resolve(
      "set.releaseDate",
      { setId: "ex7", series: "ex" },
      {
        tcgdex: "2004-11-01",
        tcgplayer: "2004-11-01T00:00:00",
        scrydex: "2004-11-01",
        bulbapedia: "2004/11/08",
      },
    );
    expect(r.value).toBe("2004-11-08");
    expect(r.excused.map((e: { source: string }) => e.source).sort()).toEqual([
      "scrydex",
      "tcgdex",
      "tcgplayer",
    ]);
  });

  it("leaves a modern date to the three that read it", () => {
    const r = resolve(
      "set.releaseDate",
      { setId: "sv08", series: "sv" },
      { tcgdex: "2024-11-08", tcgplayer: "2024-11-08T00:00:00", scrydex: "2024-11-08" },
    );
    expect(r.outcome).toBe("agreed");
    expect(r.value).toBe("2024-11-08");
    expect(r.excused).toEqual([]);
  });

  it("keeps TCGplayer out of a Japanese card's rarity", () => {
    const r = resolve("card.rarity", { language: "ja", rarity: null }, { tcgplayer: "Common" });
    expect(r.outcome).toBe("silent");
    expect(
      exceptionsFor("card.rarity", { language: "ja" }).map((e: { source: string }) => e.source),
    ).toContain("tcgplayer");
  });

  it("keeps a Trainer out of a Pokédex slot", () => {
    const r = resolve(
      "card.species",
      { cardId: "bw7-91", category: "Trainer" },
      { cardorb: [25], tcgdex: null },
    );
    expect(r.outcome).toBe("silent");
  });

  it("names the sets TCGdex files as plain that are holofoil throughout", () => {
    expect([...HOLO_THROUGHOUT].sort()).toEqual(["30th", "30th-c", "xya"]);
  });
});

describe("subsetName", () => {
  it("writes a subset the way the copy always has, with no store colon", () => {
    expect(subsetName("30th Celebration: Classic Collection")).toBe(
      "30th Celebration Classic Collection",
    );
    expect(subsetName("Crown Zenith Galarian Gallery")).toBe("Crown Zenith Galarian Gallery");
  });
});
