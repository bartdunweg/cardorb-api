import { describe, expect, it } from "vitest";
import { MIN_PASSWORD, validateUsername } from "./account";

const why = (n: string) => {
  const r = validateUsername(n);
  return r.ok ? null : r.error;
};

describe("validateUsername", () => {
  it("accepts an ordinary name", () => {
    expect(why("bartdunweg")).toBeNull();
    expect(why("bart-dunweg")).toBeNull();
    expect(why("b2")).toBeNull();
  });

  it("agrees with the check constraint on both ends of the range", () => {
    // These bounds and username_shape in the accounts migration have to match.
    // Validation more generous than the column turns a valid-looking form into
    // a 500 from a constraint; stricter, and a name the database would take is
    // refused for no reason anybody can see.
    expect(why("a")).toMatch(/too short/i);
    expect(why("ab")).toBeNull();
    expect(why("a".repeat(30))).toBeNull();
    expect(why("a".repeat(31))).toMatch(/too long/i);
  });

  it("refuses a leading hyphen, which the constraint also refuses", () => {
    expect(why("-bart")).toMatch(/hyphen/i);
    expect(why("bart-")).toBeNull();
  });

  it("says which rule was broken rather than 'invalid'", () => {
    // The whole point of a rule somebody can see is that they can satisfy it.
    expect(why("Bart")).toMatch(/lowercase/i);
    expect(why("bart dunweg")).toMatch(/letters, numbers and hyphens/i);
    expect(why("bart_dunweg")).toMatch(/letters, numbers and hyphens/i);
    expect(why("bart.dunweg")).toMatch(/letters, numbers and hyphens/i);
  });

  it("asks for something rather than complaining about nothing", () => {
    expect(why("")).toMatch(/pick a name/i);
  });

  it("keeps the password floor where config.toml put it", () => {
    // minimum_password_length in supabase/config.toml. If these drift, the form
    // promises one thing and the auth server enforces another.
    expect(MIN_PASSWORD).toBe(10);
  });
});
