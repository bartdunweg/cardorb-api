import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { indexByNumber } from "./catalogue/set-index";
import {
  PROMO_PREFIXES,
  cardNumber,
  compareCardNumbers,
  numberForms,
  storedCardNumber,
} from "./util";

describe("cardNumber", () => {
  it("drops leading zeros and upper-cases a letter suffix", () => {
    expect(cardNumber("014")).toBe("14");
    expect(cardNumber("150A")).toBe("150A");
    expect(cardNumber("XY150a")).toBe("XY150A");
    expect(cardNumber("SWSH282")).toBe("SWSH282");
    expect(cardNumber("0")).toBe("0");
  });
});

describe("cardNumber with a prefix", () => {
  it("drops zeros after the letters as well", () => {
    expect(cardNumber("SV01")).toBe("SV1");
    expect(cardNumber("TG04")).toBe("TG4");
  });
});

/**
 * Real numbers from the owner's collection and the catalogue, 2026-09-12. Venusaur EX was
 * stored as XY123 among bare numbers and sorted to the bottom of XY Black Star Promos.
 */
const shuffled = (list: string[]) => [...list].reverse().sort((a, b) => (a < b ? 1 : -1));
const sorted = (list: string[]) => [...list].sort(compareCardNumbers);

describe("compareCardNumbers", () => {
  it("puts XY123 between 122 and 124 among the 28 XY promos held", () => {
    const xy = [
      "67A",
      "74",
      "75",
      "76",
      "77",
      "78",
      "79",
      "80",
      "81",
      "82",
      "83",
      "110",
      "111",
      "112",
      "113",
      "114",
      "115",
      "117",
      "118",
      "119",
      "120",
      "121",
      "122",
      "XY123",
      "124",
      "150A",
      "185",
      "186",
    ];
    expect(xy).toHaveLength(28);
    expect(sorted(shuffled(xy))).toEqual(xy);
  });

  it("reads the promo prefix the same whether the neighbours carry it or not", () => {
    expect(sorted(["XY124", "122", "XY123"])).toEqual(["122", "XY123", "XY124"]);
    expect(sorted(["SWSH051", "SWSH050", "049"])).toEqual(["049", "SWSH050", "SWSH051"]);
    expect(sorted(["SM230", "SM229", "228"])).toEqual(["228", "SM229", "SM230"]);
    expect(sorted(["SVP044", "045", "043"])).toEqual(["043", "SVP044", "045"]);
    expect(sorted(["BW10", "9", "DP8", "HGSS11"])).toEqual(["DP8", "9", "BW10", "HGSS11"]);
  });

  it("orders plain numbers numerically and a letter after its number", () => {
    expect(sorted(["122", "10", "2"])).toEqual(["2", "10", "122"]);
    expect(sorted(["68", "67A", "67"])).toEqual(["67", "67A", "68"]);
  });

  it("keeps Silver Tempest's Trainer Gallery after 195, in order", () => {
    const main = Array.from({ length: 195 }, (_, i) => String(i + 1).padStart(3, "0"));
    const gallery = Array.from({ length: 22 }, (_, i) => `TG${String(i + 1).padStart(2, "0")}`);
    expect(sorted(shuffled([...gallery, ...main]))).toEqual([...main, ...gallery]);
  });

  it("keeps Generations' Radiant Collection after the main run, numeric within", () => {
    expect(sorted(["RC10", "83", "RC2", "1", "RC1", "32"])).toEqual([
      "1",
      "32",
      "83",
      "RC1",
      "RC2",
      "RC10",
    ]);
  });

  it("orders the SV promos by number, padding and all", () => {
    expect(sorted(["088", "013", "043"])).toEqual(["013", "043", "088"]);
  });

  it("groups subsets by their letters after the run, with Shiny Vault apart from the promos", () => {
    expect(sorted(["SV2", "TG01", "H3", "SV1", "5", "GG01"])).toEqual([
      "5",
      "GG01",
      "H3",
      "SV1",
      "SV2",
      "TG01",
    ]);
  });

  it("puts an empty number last and is total on equal forms", () => {
    expect(sorted(["", "1", "TG01"])).toEqual(["1", "TG01", ""]);
    expect(sorted(["43", "043"])).toEqual(sorted(["043", "43"]));
  });
});

describe("storedCardNumber", () => {
  it("strips a promo set's letters and keeps the rest as written", () => {
    expect(storedCardNumber("XY123")).toBe("123");
    expect(storedCardNumber("xy67a")).toBe("67A");
    expect(storedCardNumber("SWSH050")).toBe("050");
    expect(storedCardNumber("SVP044")).toBe("044");
    expect(storedCardNumber("HGSS01")).toBe("01");
    expect(storedCardNumber(" 074 ")).toBe("074");
  });

  it("keeps a subset's letters: TG01 is not card 1", () => {
    for (const n of ["TG01", "GG70", "RC5", "SV49", "SH3", "H32", "A", "ONE"]) {
      expect(storedCardNumber(n)).toBe(n);
    }
  });

  it("finds the stored form in the catalogue index, so a normalised promo keeps its card", () => {
    const index = indexByNumber([[{ id: "xyp-XY123", localId: "XY123", name: "Venusaur EX" }]]);
    const hit = numberForms(storedCardNumber("XY123"))
      .map((f) => index[f.toLowerCase()])
      .find(Boolean);
    expect(hit?.id).toBe("xyp-XY123");
  });

  it("uses the same prefixes as the database's CHECK constraint", () => {
    const sql = readFileSync(
      join(
        __dirname,
        "../../../supabase/migrations/20260912180000_promo_numbers_without_prefix.sql",
      ),
      "utf8",
    );
    const lists = [...sql.matchAll(/\^\(([A-Z|]+)\)/g)].map((m) => m[1]);
    expect(lists.length).toBeGreaterThanOrEqual(3);
    for (const list of lists) expect(list).toBe(PROMO_PREFIXES.join("|"));
  });
});
