import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareSet, isAccepted } from "./bulbapedia-compare.mjs";
import {
  cardName,
  nameKey,
  numberKey,
  parseInfobox,
  parseSetlists,
  readNumber,
} from "./bulbapedia-setlist.mjs";

/**
 * The fixtures are five real set pages, cut to their infobox and set lists (each names its
 * revision), chosen for the ways a list is written: Base Set with its Japanese list unnumbered,
 * Neo Destiny with Unown and Shining cards, Holon Phantoms with δ and ☆, Crown Zenith with its
 * Galarian Gallery and entries in the newer template, BREAKthrough with Blue Shock and Red Flash
 * after it.
 */
const page = (slug: string) =>
  readFileSync(join(__dirname, `bulbapedia-${slug}.fixture.wikitext`), "utf8");
const lists = (slug: string) => parseSetlists(page(slug));
const list = (slug: string, title: string) => {
  const found = lists(slug).find((l) => l.title === title);
  if (!found) throw new Error(`no list "${title}" in ${slug}`);
  return found;
};
const at = (slug: string, title: string, number: string) =>
  list(slug, title).entries.find((e) => e.number === number)?.name;

describe("parseSetlists", () => {
  it("reads every list on a page in order, reprint lists marked", () => {
    expect(lists("base-set").map((l) => [l.title, l.promo, l.entries.length])).toEqual([
      ["Additional cards", true, 16],
      ["Corrected error cards", true, 8],
      ["Base Set", false, 102],
      ["Expansion Pack", false, 102],
    ]);
    expect(lists("breakthrough").map((l) => [l.title, l.entries.length])).toEqual([
      ["Additional cards", 29],
      ["BREAKthrough", 164],
      ["Blue Shock", 65],
      ["Red Flash", 65],
    ]);
  });

  it("splits the number from the printed total, and reads None as no number", () => {
    const base = list("base-set", "Base Set").entries;
    expect(base[0]).toEqual({ number: "1", printedTotal: "102", name: "Alakazam" });
    expect(list("base-set", "Expansion Pack").entries.every((e) => e.number === null)).toBe(true);
    expect(list("breakthrough", "Red Flash").entries[0]).toEqual({
      number: "001",
      printedTotal: "059",
      name: "Paras",
    });
  });

  it("reads Neo Destiny's Unown and Shining cards, and its unnumbered Japanese list", () => {
    expect(at("neo-destiny", "Neo Destiny", "27")).toBe("Unown G");
    expect(at("neo-destiny", "Neo Destiny", "107")).toBe("Shining Charizard");
    const japanese = list("neo-destiny", "Darkness, and to Light...");
    expect(japanese.entries).toHaveLength(113);
    expect(japanese.entries.map((e) => e.name)).toContain("Shining Tyranitar");
  });

  it("keeps δ and ☆ in Holon Phantoms' names, from a TCG ID and from a link", () => {
    expect(at("holon-phantoms", "EX Holon Phantoms", "1")).toBe("Armaldo δ");
    expect(at("holon-phantoms", "EX Holon Phantoms", "98")).toBe("δ Rainbow Energy");
    expect(at("holon-phantoms", "EX Holon Phantoms", "102")).toBe("Gyarados ☆ δ");
    expect(at("holon-phantoms", "EX Holon Phantoms", "104")).toBe("Pikachu ☆");
    expect(list("holon-phantoms", "Holon Phantom").entries).toHaveLength(52);
  });

  it("reads Crown Zenith's newer entries, with the symbol column, and its Galarian Gallery", () => {
    expect(at("crown-zenith", "Crown Zenith", "001")).toBe("Oddish");
    expect(at("crown-zenith", "Crown Zenith", "114")).toBe("Regigigas VSTAR");
    expect(at("crown-zenith", "Crown Zenith", "152")).toBe("Grass Energy");
    const gallery = list("crown-zenith", "Galarian Gallery").entries;
    expect(gallery).toHaveLength(70);
    expect(gallery.at(-1)).toEqual({
      number: "GG70",
      printedTotal: "GG70",
      name: "Arceus VSTAR",
    });
  });

  it("puts a Mega prefix and an EX suffix on a linked name once", () => {
    expect(at("breakthrough", "BREAKthrough", "153")).toBe("Houndoom-EX");
    expect(at("breakthrough", "BREAKthrough", "154")).toBe("M Houndoom-EX");
    expect(at("breakthrough", "Blue Shock", "063")).toBe("M Mewtwo-EX");
  });
});

describe("cardName", () => {
  it("does not repeat a suffix the TCG ID already names", () => {
    expect(cardName("{{TCG ID|Destined Rivals|Yanmega ex|3|Yanmega}}{{ex}}")).toBe("Yanmega ex");
  });

  it("reads the first version of a promo cell", () => {
    expect(
      cardName(
        "{{TCG ID|BW Promo|Crobat|51}}<br>{{TCG ID|BW Promo|Crobat|51}} <small>'''[Staff]'''</small>",
      ),
    ).toBe("Crobat");
  });

  it("takes the first field of a plain template, and ignores a name drawn in pieces", () => {
    expect(cardName("{{OBP|Darkness Energy|Basic}}")).toBe("Darkness Energy");
    expect(
      cardName(
        "{{TCG ID|Chaos Rising|Bubbly W Energy|84|Bubbly}} {{e|Water}} {{TCG ID|Chaos Rising|Bubbly W Energy|84|Energy}}",
      ),
    ).toBe("Bubbly W Energy");
  });
});

describe("parseInfobox", () => {
  it("reads the English and Japanese set names", () => {
    expect(parseInfobox(page("breakthrough"))).toEqual({
      setname: "BREAKthrough",
      jasetname: "青い衝撃 • 赤い閃光",
    });
  });
});

describe("keys", () => {
  it("folds a number's zeros and case, not its prefix", () => {
    expect(numberKey("001")).toBe(numberKey("1"));
    expect(numberKey("GG01")).toBe(numberKey("gg1"));
    expect(numberKey("TG01")).not.toBe(numberKey("1"));
    expect(readNumber("None")).toEqual({ number: null, printedTotal: null });
  });

  it("folds spelling, not naming", () => {
    expect(nameKey("Mewtwo ★")).toBe(nameKey("Mewtwo☆"));
    expect(nameKey("Kyogre Star")).toBe(nameKey("Kyogre ☆"));
    expect(nameKey("Xerneas EX")).toBe(nameKey("Xerneas-EX"));
    expect(nameKey("Unown [A]")).toBe(nameKey("Unown A"));
    expect(nameKey("Nidoran ♂")).toBe(nameKey("Nidoran♂"));
    expect(nameKey("Impostor Professor Oak")).not.toBe(nameKey("Imposter Professor Oak"));
  });
});

describe("compareSet", () => {
  const baseSet = list("base-set", "Base Set");
  const set = { language: "en", id: "base1", name: "Base Set", total: 102, printed_total: 102 };
  const cards = baseSet.entries.map((e) => ({
    id: `base1-${e.number}`,
    local_id: e.number as string,
    name: e.name,
  }));
  const compare = (c: typeof cards, s: typeof set = set) =>
    compareSet(s, c, { lists: ["Base Set"], found: [baseSet] });

  it("finds nothing where the copy says what the list says", () => {
    expect(compare(cards)).toEqual([]);
  });

  it("tells a name from a spelling, and reports a missing card and a wrong total", () => {
    const changed = cards
      .filter((c) => c.local_id !== "5")
      .map((c) =>
        c.local_id === "1"
          ? { ...c, name: "Alakazam!" }
          : c.local_id === "73"
            ? { ...c, name: "Impostor Professor Oak" }
            : c.local_id === "2"
              ? { ...c, name: "BLASTOISE" }
              : c,
      );
    const kinds = compare(changed, { ...set, total: 101 }).map((d) => [
      d.kind,
      d.ours,
      d.bulbapedia,
    ]);
    const expected = [
      ["set total", "101", "102"],
      ["card name spelling", "BLASTOISE", "Blastoise"],
      ["card name", "Impostor Professor Oak", "Imposter Professor Oak"],
      ["card name", "Alakazam!", "Alakazam"],
      ["missing card", "", "5 Clefairy"],
    ];
    expect(kinds).toHaveLength(expected.length);
    expect(kinds).toEqual(expect.arrayContaining(expected));
  });

  it("keeps an accepted difference out only while both sides still say the same", () => {
    const [difference] = compare(
      cards.map((c) => (c.local_id === "73" ? { ...c, name: "Impostor Professor Oak" } : c)),
    );
    const accepted = [
      {
        kind: "card name",
        language: "en",
        set: "base1",
        number: "73",
        ours: "Impostor Professor Oak",
        bulbapedia: "Imposter Professor Oak",
      },
    ];
    expect(isAccepted(difference, accepted)).toBe(true);
    expect(isAccepted({ ...difference, bulbapedia: "Impostor Professor Oak" }, accepted)).toBe(
      false,
    );
  });
});
