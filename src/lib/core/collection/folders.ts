/**
 * What a folder may be called. One field, so the whole validation is here
 * rather than in two route handlers that would drift.
 */
export const FOLDER_NAME_MAX = 60;

export function validateFolderName(
  value: unknown,
): { kind: "ok"; name: string } | { kind: "invalid"; error: string } {
  if (typeof value !== "string") return { kind: "invalid", error: "A folder needs a name." };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { kind: "invalid", error: "A folder needs a name." };
  if (name.length > FOLDER_NAME_MAX)
    return { kind: "invalid", error: `A folder name is at most ${FOLDER_NAME_MAX} characters.` };
  return { kind: "ok", name };
}

/**
 * A rule folder fills itself: instead of copies filed in it, it shows every owned copy
 * that matches. AND between the fields, OR within a list. A folder has a rule or has
 * cards filed in it, never both; the routes keep the two apart.
 */
/** The length of pokedex.generated.json. */
export const DEX_MAX = 1025;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type DexRange = { from: number; to: number };

export function readDexRange(
  value: unknown,
): { kind: "ok"; range: DexRange } | { kind: "invalid"; error: string } {
  if (!isRecord(value) || !Number.isInteger(value.from) || !Number.isInteger(value.to))
    return { kind: "invalid", error: "A Pokédex range is two whole numbers, from and to." };
  const from = value.from as number;
  const to = value.to as number;
  if (from < 1 || to > DEX_MAX || from > to)
    return { kind: "invalid", error: `A Pokédex range runs from 1 to ${DEX_MAX}, from before to.` };
  return { kind: "ok", range: { from, to } };
}

/**
 * A folder shown as a Pokédex: its cards in the national order, one slot per Pokémon. `missing`
 * shows the slots the folder has no card of; `dex` is the range a person collects, all of it
 * when absent. Any folder may carry it; the built-in Pokédex is All cards with the profile's.
 */
export type PokedexSetting = { missing: boolean; dex?: DexRange };

export function validatePokedexSetting(
  value: unknown,
): { kind: "ok"; setting: PokedexSetting } | { kind: "invalid"; error: string } {
  if (!isRecord(value)) return { kind: "invalid", error: "A Pokédex setting is an object." };
  for (const key of Object.keys(value))
    if (key !== "missing" && key !== "dex")
      return { kind: "invalid", error: `A Pokédex setting has no field called ${key}.` };
  if (typeof value.missing !== "boolean")
    return { kind: "invalid", error: "A Pokédex setting says whether to show the missing ones." };
  const setting: PokedexSetting = { missing: value.missing };
  if (value.dex !== undefined) {
    const dex = readDexRange(value.dex);
    if (dex.kind === "invalid") return dex;
    setting.dex = dex.range;
  }
  return { kind: "ok", setting };
}

export type FolderRule = {
  /** National dex numbers, inclusive. A trainer or energy has none and never matches. */
  dex?: { from: number; to: number };
  /** Sets, by the name the catalogue spells or the title it shows. */
  sets?: string[];
  /** Rarities, in the catalogue's words. */
  rarities?: string[];
};

export type FolderKind = "manual" | "rule";

export const RULE_LIST_MAX = 20;
export const RULE_TERM_MAX = 100;

const RULE_KEYS = new Set(["dex", "sets", "rarities"]);

function readTerms(
  value: unknown,
  what: string,
): { kind: "ok"; terms: string[] } | { kind: "invalid"; error: string } {
  if (!Array.isArray(value)) return { kind: "invalid", error: `${what} is a list.` };
  if (value.length === 0) return { kind: "invalid", error: `${what} names at least one.` };
  if (value.length > RULE_LIST_MAX)
    return { kind: "invalid", error: `${what} names at most ${RULE_LIST_MAX}.` };
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return { kind: "invalid", error: `${what} is a list of names.` };
    const term = raw.trim().replace(/\s+/g, " ");
    if (!term) return { kind: "invalid", error: `${what} cannot name nothing.` };
    if (term.length > RULE_TERM_MAX)
      return {
        kind: "invalid",
        error: `A name in ${what.toLowerCase()} is at most ${RULE_TERM_MAX} characters.`,
      };
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return { kind: "ok", terms };
}

export function validateFolderRule(
  value: unknown,
): { kind: "ok"; rule: FolderRule } | { kind: "invalid"; error: string } {
  if (!isRecord(value)) return { kind: "invalid", error: "A rule is an object." };
  for (const key of Object.keys(value))
    if (!RULE_KEYS.has(key))
      return { kind: "invalid", error: `A rule has no field called ${key}.` };

  const rule: FolderRule = {};
  if (value.dex !== undefined) {
    const dex = readDexRange(value.dex);
    if (dex.kind === "invalid") return dex;
    rule.dex = dex.range;
  }
  if (value.sets !== undefined) {
    const sets = readTerms(value.sets, "Sets");
    if (sets.kind === "invalid") return sets;
    rule.sets = sets.terms;
  }
  if (value.rarities !== undefined) {
    const rarities = readTerms(value.rarities, "Rarities");
    if (rarities.kind === "invalid") return rarities;
    rule.rarities = rarities.terms;
  }
  if (!rule.dex && !rule.sets && !rule.rarities)
    return { kind: "invalid", error: "A rule needs a Pokédex range, a set or a rarity." };
  return { kind: "ok", rule };
}

/** What a rule reads on a copy; the whole CardItem satisfies it. */
export type RuleSubject = {
  speciesId: number | null;
  set: string;
  setTitle: string;
  rarity: string | null;
  owned: boolean;
};

/**
 * Whether one copy is in a rule folder. Owned only, ever: a wished copy is not in any folder
 * that fills itself. Lowercased once per rule, not per copy, since this runs over the whole
 * collection on every page.
 */
export function ruleMatcher(rule: FolderRule): (it: RuleSubject) => boolean {
  const sets = rule.sets?.map((s) => s.toLowerCase());
  const rarities = rule.rarities?.map((r) => r.toLowerCase());
  const dex = rule.dex;
  return (it) => {
    if (!it.owned) return false;
    if (dex && (it.speciesId === null || it.speciesId < dex.from || it.speciesId > dex.to))
      return false;
    if (sets) {
      const name = it.set.toLowerCase();
      const title = it.setTitle.toLowerCase();
      if (!sets.some((s) => s === name || s === title)) return false;
    }
    if (rarities && !rarities.includes((it.rarity ?? "").toLowerCase())) return false;
    return true;
  };
}

export const matchesRule = (it: RuleSubject, rule: FolderRule): boolean => ruleMatcher(rule)(it);

export type FolderBody = { name?: string; rule?: FolderRule; pokedex?: PokedexSetting | null };

/**
 * A folder's body, for both routes: on create a name is required and a rule and a Pokédex
 * setting may come with it; on patch any of the three. `pokedex: null` turns the setting off,
 * unlike `rule`, which a folder keeps. Nothing else is accepted, so a client cannot send a field
 * the API silently drops.
 */
export function readFolderBody(
  body: unknown,
  mode: "create" | "patch",
): { kind: "ok"; body: FolderBody } | { kind: "invalid"; error: string } {
  if (!isRecord(body)) return { kind: "invalid", error: "Invalid request" };
  const out: FolderBody = {};
  if (body.name !== undefined || mode === "create") {
    const name = validateFolderName(body.name);
    if (name.kind === "invalid") return name;
    out.name = name.name;
  }
  if (body.rule !== undefined) {
    if (body.rule === null)
      return {
        kind: "invalid",
        error: "A rule folder keeps its rule. Make a new folder to file cards by hand.",
      };
    const rule = validateFolderRule(body.rule);
    if (rule.kind === "invalid") return rule;
    out.rule = rule.rule;
  }
  if (body.pokedex !== undefined) {
    if (body.pokedex === null) out.pokedex = null;
    else {
      const setting = validatePokedexSetting(body.pokedex);
      if (setting.kind === "invalid") return setting;
      out.pokedex = setting.setting;
    }
  }
  if (
    mode === "patch" &&
    out.name === undefined &&
    out.rule === undefined &&
    out.pokedex === undefined
  )
    return {
      kind: "invalid",
      error: "Nothing to change: send a name, a rule or a Pokédex setting.",
    };
  return { kind: "ok", body: out };
}
