import { describe, expect, it } from "vitest";
import {
  readFolderBody,
  ruleMatcher,
  validateFolderRule,
  type FolderRule,
  type RuleSubject,
  validatePokedexSetting,
} from "./folders";

const matchesRule = (it: RuleSubject, rule: FolderRule) => ruleMatcher(rule)(it);

const copy = (over: Partial<RuleSubject> = {}): RuleSubject => ({
  speciesId: 25,
  set: "sv04",
  setTitle: "Paradox Rift",
  rarity: "Illustration Rare",
  owned: true,
  ...over,
});

describe("validateFolderRule", () => {
  it("normalises names and drops a repeat in another case", () => {
    const r = validateFolderRule({
      dex: { from: 1, to: 151 },
      sets: ["  Paradox  Rift ", "paradox rift"],
      rarities: ["Common"],
    });
    expect(r).toEqual({
      kind: "ok",
      rule: { dex: { from: 1, to: 151 }, sets: ["Paradox Rift"], rarities: ["Common"] },
    });
  });
  it("refuses what it cannot mean", () => {
    expect(validateFolderRule("gen 1").kind).toBe("invalid");
    expect(validateFolderRule({}).kind).toBe("invalid");
    expect(validateFolderRule({ artist: "Mitsuhiro Arita" })).toMatchObject({
      error: "A rule has no field called artist.",
    });
    expect(validateFolderRule({ dex: { from: 151, to: 1 } }).kind).toBe("invalid");
    expect(validateFolderRule({ dex: { from: 0, to: 10 } }).kind).toBe("invalid");
    expect(validateFolderRule({ dex: { from: 1, to: 1026 } }).kind).toBe("invalid");
    expect(validateFolderRule({ dex: { from: 1.5, to: 10 } }).kind).toBe("invalid");
    expect(validateFolderRule({ sets: [] }).kind).toBe("invalid");
    expect(validateFolderRule({ sets: [" "] }).kind).toBe("invalid");
    expect(validateFolderRule({ sets: Array.from({ length: 21 }, (_, i) => `s${i}`) }).kind).toBe(
      "invalid",
    );
    expect(validateFolderRule({ rarities: [3] }).kind).toBe("invalid");
  });
});

describe("matchesRule", () => {
  it("reads the dex range inclusively and never a copy without a number", () => {
    const rule = { dex: { from: 1, to: 151 } };
    expect(matchesRule(copy({ speciesId: 1 }), rule)).toBe(true);
    expect(matchesRule(copy({ speciesId: 151 }), rule)).toBe(true);
    expect(matchesRule(copy({ speciesId: 152 }), rule)).toBe(false);
    expect(matchesRule(copy({ speciesId: null }), rule)).toBe(false);
  });
  it("matches a set by its name or its title, in any case", () => {
    expect(matchesRule(copy(), { sets: ["SV04"] })).toBe(true);
    expect(matchesRule(copy(), { sets: ["paradox rift"] })).toBe(true);
    expect(matchesRule(copy(), { sets: ["Obsidian Flames"] })).toBe(false);
  });
  it("matches a rarity in any case and ANDs the fields", () => {
    expect(matchesRule(copy(), { rarities: ["illustration rare"] })).toBe(true);
    expect(matchesRule(copy(), { dex: { from: 1, to: 151 }, rarities: ["Common"] })).toBe(false);
    expect(matchesRule(copy({ rarity: null }), { rarities: ["Common"] })).toBe(false);
  });
  it("never matches a copy that is not owned", () => {
    expect(matchesRule(copy({ owned: false }), { dex: { from: 1, to: 151 } })).toBe(false);
  });
});

describe("readFolderBody", () => {
  it("wants a name on create and takes a rule with it", () => {
    expect(readFolderBody({ rule: { dex: { from: 1, to: 9 } } }, "create").kind).toBe("invalid");
    expect(
      readFolderBody({ name: " Kanto ", rule: { dex: { from: 1, to: 151 } } }, "create"),
    ).toEqual({
      kind: "ok",
      body: { name: "Kanto", rule: { dex: { from: 1, to: 151 } } },
    });
  });
  it("takes isPublic as a boolean and nothing else", () => {
    expect(readFolderBody({ isPublic: true }, "patch")).toEqual({
      kind: "ok",
      body: { isPublic: true },
    });
    expect(readFolderBody({ isPublic: "yes" }, "patch").kind).toBe("invalid");
    expect(readFolderBody({ name: "Kanto", isPublic: false }, "create")).toEqual({
      kind: "ok",
      body: { name: "Kanto", isPublic: false },
    });
  });
  it("wants at least one change on patch and never a null rule", () => {
    expect(readFolderBody({}, "patch").kind).toBe("invalid");
    expect(readFolderBody({ rule: null }, "patch").kind).toBe("invalid");
    expect(readFolderBody({ name: "Johto" }, "patch")).toEqual({
      kind: "ok",
      body: { name: "Johto" },
    });
  });
});

describe("validatePokedexSetting and the body that carries it", () => {
  it("takes rarities, trimmed and each once, and refuses an empty or an oversize list", () => {
    expect(
      validatePokedexSetting({
        missing: true,
        rarities: [" Illustration rare ", "Illustration rare", "Hyper rare"],
      }),
    ).toEqual({
      kind: "ok",
      setting: { missing: true, rarities: ["Illustration rare", "Hyper rare"] },
    });
    expect(validatePokedexSetting({ missing: true, rarities: [] }).kind).toBe("invalid");
    expect(validatePokedexSetting({ missing: true, rarities: [3] }).kind).toBe("invalid");
  });
  it("wants the missing flag, takes a range, refuses the rest", () => {
    expect(validatePokedexSetting({ missing: true })).toEqual({
      kind: "ok",
      setting: { missing: true },
    });
    expect(validatePokedexSetting({ missing: false, dex: { from: 1, to: 151 } })).toEqual({
      kind: "ok",
      setting: { missing: false, dex: { from: 1, to: 151 } },
    });
    expect(validatePokedexSetting({}).kind).toBe("invalid");
    expect(validatePokedexSetting({ missing: "yes" }).kind).toBe("invalid");
    expect(validatePokedexSetting({ missing: true, dex: { from: 9, to: 1 } }).kind).toBe("invalid");
    expect(validatePokedexSetting({ missing: true, sets: [] }).kind).toBe("invalid");
  });
  it("comes with a folder, and null turns it off on patch", () => {
    expect(readFolderBody({ name: "Dex", pokedex: { missing: true } }, "create")).toEqual({
      kind: "ok",
      body: { name: "Dex", pokedex: { missing: true } },
    });
    expect(readFolderBody({ pokedex: null }, "patch")).toEqual({
      kind: "ok",
      body: { pokedex: null },
    });
  });
});
