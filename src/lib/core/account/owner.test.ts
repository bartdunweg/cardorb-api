import { describe, expect, it } from "vitest";
import { collectionTitle, ownerLabel, possessive } from "./owner";

describe("ownerLabel", () => {
  it("prefers the name the person gave", () => {
    expect(ownerLabel({ username: "swift-eevee-4821", displayName: "Bart" })).toBe("Bart");
  });

  it("falls back to the username when no name was given", () => {
    expect(ownerLabel({ username: "swift-eevee-4821", displayName: null })).toBe(
      "swift-eevee-4821",
    );
  });

  it("treats an empty or blank name as no name", () => {
    // Signup used to seed display_name with the generated username, and the
    // Settings field writes null for an empty string. Whitespace is the third
    // way of having given nothing, and it must not become a title of spaces.
    expect(ownerLabel({ username: "u1", displayName: "" })).toBe("u1");
    expect(ownerLabel({ username: "u1", displayName: "   " })).toBe("u1");
  });

  it("trims a name that is otherwise real", () => {
    expect(ownerLabel({ username: "u1", displayName: "  Bart  " })).toBe("Bart");
  });
});

describe("possessive", () => {
  it("uses a typographic apostrophe", () => {
    expect(possessive("Bart")).toBe("Bart’s");
    expect(possessive("Bart")).not.toContain("'");
  });

  it("keeps the s after a name that already ends in one", () => {
    expect(possessive("Lucas")).toBe("Lucas’s");
  });
});

describe("collectionTitle", () => {
  it("names the page after the person", () => {
    expect(collectionTitle({ username: "bartdunweg", displayName: "Bart" })).toBe(
      "Bart’s Pokémon card collection",
    );
  });

  it("names it after the username when there is nothing else", () => {
    expect(collectionTitle({ username: "swift-eevee-4821", displayName: null })).toBe(
      "swift-eevee-4821’s Pokémon card collection",
    );
  });
});
