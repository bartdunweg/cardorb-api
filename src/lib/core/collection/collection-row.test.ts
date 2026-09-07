import { describe, expect, it } from "vitest";
import {
  MAX,
  rowFromDraft,
  validateCardDraft,
  validateCardPatch,
  validateCopyBody,
} from "./collection-row";

const ok = (body: unknown) => {
  const result = validateCardDraft(body);
  if (result.kind !== "ok") throw new Error(`expected valid, got: ${result.error}`);
  return result.draft;
};

const why = (body: unknown) => {
  const result = validateCardDraft(body);
  return result.kind === "invalid" ? result.error : null;
};

describe("validateCardDraft", () => {
  it("needs the two fields the grouping needs", () => {
    // Not politeness about completeness: buildCollection() skips a row missing
    // either, so a card written without them would be invisible on the page it
    // was added from.
    expect(why({ set: "Base" })).toMatch(/name/i);
    expect(why({ name: "Pikachu" })).toMatch(/set/i);
    expect(why({ name: "Pikachu", set: "Base" })).toBeNull();
  });

  it("treats a missing collection flag as held, and a missing excluded as not", () => {
    // The whole database reads this way — a row with no checkbox is a card in
    // the binder — and the Postgres column defaults to true for the same reason.
    const draft = ok({ name: "Pikachu", set: "Base" });
    expect(draft.collection).toBe(true);
    expect(draft.excluded).toBe(false);
  });

  it("only lets excluded be true when it is exactly true", () => {
    expect(ok({ name: "P", set: "B", excluded: "yes" }).excluded).toBe(false);
    expect(ok({ name: "P", set: "B", excluded: true }).excluded).toBe(true);
  });

  it("turns a newline into a space rather than closing the gap", () => {
    // A run of newlines becomes one space, so a name pasted across two lines
    // reads as two words. Note what that means for a number: "0\r\n88" is not
    // repaired into "088", it becomes "0 88" and stops matching anything in the
    // catalogue. That is the honest outcome — the value really was mangled —
    // and it is pinned here so a later tidy-up does not quietly start guessing.
    expect(ok({ name: "Pika\nchu", set: "Base" }).name).toBe("Pika chu");
    expect(ok({ name: "P", number: "0\r\n88", set: "Base" }).number).toBe("0 88");
  });

  it("lets a comma through, because that was Notion's rule and not a card's", () => {
    // This used to be stripped here, which meant a set genuinely named
    // "Sun & Moon, Promos" could not be typed in. The rule left with Notion.
    expect(ok({ name: "P", set: "Sun & Moon, Promos" }).set).toBe("Sun & Moon, Promos");
    expect(ok({ name: "P", set: "B", types: ["Fire,Water"] }).types).toEqual(["Fire,Water"]);
  });

  it("refuses a finish that is not one of the three, and keeps null as 'nobody has said'", () => {
    // It used to turn "shiny" into null so an import would not lose the card.
    // No import sends a finish any more (csv.ts writes null itself), and the
    // one client that does is a form or an app editing a field on purpose,
    // where a typo silently becoming a blank is the wrong kind of kindness.
    // The same rule as validateCardPatch(), in the same sentence.
    expect(ok({ name: "P", set: "B", finish: null }).finish).toBeNull();
    expect(ok({ name: "P", set: "B" }).finish).toBeNull();
    expect(ok({ name: "P", set: "B", finish: "reverse-holo" }).finish).toBe("reverse-holo");
    expect(why({ name: "P", set: "B", finish: "shiny" })).toMatch(/finish must be null/);
  });

  it("caps the number of types rather than refusing the card", () => {
    const many = Array.from({ length: MAX.types + 5 }, (_, i) => `t${i}`);
    expect(ok({ name: "P", set: "B", types: many }).types).toHaveLength(MAX.types);
  });

  it("drops empty types and survives a types field that is not a list", () => {
    expect(ok({ name: "P", set: "B", types: ["Fire", "", "  "] }).types).toEqual(["Fire"]);
    expect(ok({ name: "P", set: "B", types: "Fire" }).types).toEqual([]);
  });

  it("refuses values longer than the column will take", () => {
    // These caps and the check constraints in the accounts migration have to
    // agree. Validation that is more generous than the column turns a
    // valid-looking form into a 500 from a constraint.
    expect(why({ name: "x".repeat(MAX.name + 1), set: "B" })).toMatch(/name is too long/i);
    expect(why({ name: "P", number: "1".repeat(MAX.number + 1), set: "B" })).toMatch(/number/i);
    expect(why({ name: "P", set: "s".repeat(MAX.option + 1) })).toMatch(/value is too long/i);
    expect(why({ name: "P", set: "B", gen: "g".repeat(MAX.option + 1) })).toMatch(/too long/i);
    // And accepts exactly the cap, which is the off-by-one worth pinning.
    expect(why({ name: "P", set: "s".repeat(MAX.option) })).toBeNull();
  });

  it("survives a body that is not an object", () => {
    expect(why(null)).toMatch(/name/i);
    expect(why("Pikachu")).toMatch(/name/i);
  });
});

describe("rowFromDraft", () => {
  it("turns the empty selects into absences", () => {
    // A rarity nobody filled in is missing, not blank, and the difference shows
    // up the moment anything groups or counts by it.
    const row = rowFromDraft(ok({ name: "Pikachu", set: "Base" }));
    expect(row).toEqual({
      name: "Pikachu",
      number: "",
      setName: "Base",
      rarity: null,
      gen: null,
      types: [],
      owned: true,
      excluded: false,
      finish: null,
      foilPattern: null,
      quantity: 1,
      condition: null,
      grade: null,
      language: null,
      purchasePrice: null,
      purchaseDate: null,
      notes: null,
      isFavorite: false,
      collectionId: null,
    });
  });

  it("carries the wishlist flag across as owned", () => {
    const row = rowFromDraft(ok({ name: "P", set: "B", collection: false }));
    expect(row.owned).toBe(false);
  });
});

const patched = (body: unknown) => {
  const result = validateCardPatch(body);
  if (result.kind !== "ok") throw new Error(`expected valid, got: ${result.error}`);
  return result.patch;
};

const refused = (body: unknown) => {
  const result = validateCardPatch(body);
  return result.kind === "invalid" ? result.error : null;
};

/**
 * Written before the refactor below it, not after, and that is the point.
 *
 * `validateCardPatch` had no tests at all while sitting behind a live PATCH
 * route (`/api/v1/collection/items/[id]`). These characterise what it already
 * does — including the two places it deliberately disagrees with
 * `validateCardDraft` — so that anything the refactor changed would have shown
 * up as a red test rather than as a field that quietly stopped saving.
 */
describe("validateCardPatch", () => {
  it("touches only the keys that were sent", () => {
    // updateRow() in postgres.ts builds its SQL from exactly this object, so a
    // key that appears here is a column that gets written. Filling in defaults
    // for fields nobody mentioned would overwrite them with guesses.
    expect(patched({ owned: false })).toEqual({ owned: false });
    expect(Object.keys(patched({ notes: "mint" }))).toEqual(["notes"]);
  });

  it("refuses an empty patch rather than writing nothing", () => {
    expect(refused({})).toMatch(/nothing to change/i);
    expect(refused(null)).toMatch(/nothing to change/i);
    expect(refused({ unknownField: 1 })).toMatch(/nothing to change/i);
  });

  it("wants a real boolean for each of the three flags", () => {
    for (const key of ["owned", "excluded", "isFavorite"]) {
      expect(patched({ [key]: true })).toEqual({ [key]: true });
      expect(patched({ [key]: false })).toEqual({ [key]: false });
      // Not coerced. "false" and 0 are the two that would silently invert.
      expect(refused({ [key]: "true" })).toMatch(new RegExp(`${key} must be true or false`));
      expect(refused({ [key]: 0 })).toMatch(new RegExp(`${key} must be true or false`));
    }
  });

  it("reports the flag first when a body is invalid in two ways at once", () => {
    // Pinned rather than assumed. Gathering the three flags into one loop moved
    // them ahead of finish and quantity, so this is the one answer the refactor
    // changed — only reachable by a client sending two broken fields together.
    expect(refused({ excluded: "no", finish: "shiny" })).toMatch(/excluded must be/);
  });

  it("refuses an unknown finish, as a draft does", () => {
    // The two used to disagree — a draft turned an odd finish into null so an
    // import would not lose the card — and now say the same sentence.
    expect(patched({ finish: null })).toEqual({ finish: null });
    expect(refused({ finish: "shiny" })).toMatch(/finish must be null/);
  });

  it("keeps quantity a whole number of at least one", () => {
    expect(patched({ quantity: "3" }).quantity).toBe(3);
    expect(refused({ quantity: 0 })).toMatch(/at least 1/);
    expect(refused({ quantity: 1.5 })).toMatch(/at least 1/);
  });

  it("cleans condition and grade, and lets null clear them", () => {
    expect(patched({ condition: "  Near Mint  " }).condition).toBe("Near Mint");
    // A newline becomes a space; runs of spaces are left alone. cleanText only
    // flattens line breaks, which is the whole of its difference from trim().
    expect(patched({ condition: "Near\nMint" }).condition).toBe("Near Mint");
    expect(patched({ grade: null }).grade).toBeNull();
    // Whitespace only is the same as clearing it.
    expect(patched({ condition: "   " }).condition).toBeNull();
    expect(refused({ condition: 7 })).toMatch(/condition must be text or null/);
    expect(refused({ grade: "g".repeat(MAX.conditionOrGrade + 1) })).toMatch(/too long/);
  });

  it("trims notes but does not collapse them, unlike condition and grade", () => {
    // The second deliberate disagreement, and the reason notes is not in the
    // same loop as condition and grade: cleanText() turns every line break into
    // a space, which would flatten a note somebody wrote over two lines into
    // one. notes uses trim(), so the breaks survive.
    expect(patched({ notes: "  two\n\nlines  " }).notes).toBe("two\n\nlines");
    expect(patched({ notes: "   " }).notes).toBeNull();
    expect(refused({ notes: 7 })).toMatch(/notes must be text or null/);
    expect(refused({ notes: "n".repeat(MAX.notes + 1) })).toMatch(/too long/);
  });

  it("takes a price of zero but not a negative one", () => {
    expect(patched({ purchasePrice: 0 }).purchasePrice).toBe(0);
    expect(patched({ purchasePrice: null }).purchasePrice).toBeNull();
    expect(refused({ purchasePrice: -1 })).toMatch(/not valid/);
    expect(refused({ purchasePrice: "free" })).toMatch(/not valid/);
  });

  it("checks a purchase date parses", () => {
    expect(patched({ purchaseDate: "2026-01-31" }).purchaseDate).toBe("2026-01-31");
    expect(patched({ purchaseDate: null }).purchaseDate).toBeNull();
    expect(refused({ purchaseDate: "yesterday" })).toMatch(/not valid/);
    expect(refused({ purchaseDate: 20260131 })).toMatch(/date string or null/);
  });
});

describe("validateCopyBody", () => {
  it("defaults count to one and passes the changes through", () => {
    expect(validateCopyBody({ language: "ja" }, true)).toEqual({
      kind: "ok",
      count: 1,
      changes: { language: "ja" },
    });
  });

  it("refuses a count that is no count", () => {
    for (const count of [0, 1.5, "3", 1000]) {
      expect(validateCopyBody({ language: "ja", count }, true).kind).toBe("invalid");
    }
  });

  it("refuses the card's identity, quantity, owned and the star", () => {
    for (const body of [{ name: "x" }, { quantity: 2 }, { owned: false }, { isFavorite: true }]) {
      const r = validateCopyBody(body, false);
      expect(r.kind).toBe("invalid");
      if (r.kind === "invalid") expect(r.error).toContain("A copy keeps its card");
    }
  });

  it("wants at least one difference for a split, none for a copy", () => {
    expect(validateCopyBody({}, true).kind).toBe("invalid");
    expect(validateCopyBody({}, false)).toEqual({ kind: "ok", count: 1, changes: {} });
  });

  it("takes an acquired date that is past and refuses one in the future", () => {
    const past = validateCopyBody({ acquiredAt: "2026-01-02" }, true);
    expect(past.kind).toBe("ok");
    if (past.kind === "ok") expect(past.changes.acquiredAt).toMatch(/^2026-01-0[12]T/);
    expect(validateCopyBody({ acquiredAt: "2999-01-01" }, true).kind).toBe("invalid");
  });
});
