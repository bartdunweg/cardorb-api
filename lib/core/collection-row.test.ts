import { describe, expect, it } from "vitest";
import { MAX, rowFromDraft, validateCardDraft } from "./collection-row";

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
      quantity: 1,
      condition: null,
      grade: null,
      purchasePrice: null,
      purchaseDate: null,
      notes: null,
      isFavorite: false,
    });
  });

  it("carries the wishlist flag across as owned", () => {
    const row = rowFromDraft(ok({ name: "P", set: "B", collection: false }));
    expect(row.owned).toBe(false);
  });
});
