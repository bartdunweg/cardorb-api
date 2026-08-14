import { describe, expect, it } from "vitest";
import { bySlug, slugify } from "./slug";

/**
 * Routing hangs off this file, so it carries the phase's confidence.
 *
 * Every set in the collection becomes an address through slugify(), and an
 * address that cannot be resolved back is a 404 on a set somebody owns. The
 * cases below are the real names out of the collection this was built against,
 * not invented ones.
 */

const set = (name: string) => ({ name });

describe("slugify", () => {
  it("takes accents off rather than encoding them", () => {
    // pok%C3%A9mon is technically fine and unreadable, and these URLs are meant
    // to be looked at.
    expect(slugify("Pokémon Go")).toBe("pokemon-go");
  });

  it("turns punctuation into the one separator", () => {
    expect(slugify("Sun & Moon")).toBe("sun-moon");
    expect(slugify("Scarlet & Violet Base")).toBe("scarlet-violet-base");
    expect(slugify("Sword & Shield—Brilliant Stars")).toBe("sword-shield-brilliant-stars");
  });

  it("handles the names this collection actually uses", () => {
    // Not invented: these are rows out of the real database, including the one
    // where a print run is filed as a set.
    expect(slugify("Set 1 Unlimited")).toBe("set-1-unlimited");
    expect(slugify("SV Black Star Promos")).toBe("sv-black-star-promos");
    expect(slugify("MEP Black Star Promos")).toBe("mep-black-star-promos");
    expect(slugify("151")).toBe("151");
  });

  it("leaves no separator dangling at either end", () => {
    expect(slugify("  Team Rocket  ")).toBe("team-rocket");
    expect(slugify("&Fossil&")).toBe("fossil");
  });

  it("collapses a run of punctuation instead of stuttering", () => {
    expect(slugify("Sun  &  Moon")).toBe("sun-moon");
  });

  it("answers with nothing for a name that is all punctuation", () => {
    // A set cannot be called this, and if one ever is, an empty slug is a 404
    // rather than a URL that silently means something else.
    expect(slugify("—&—")).toBe("");
  });
});

describe("bySlug", () => {
  it("finds the set a slug names", () => {
    const sets = [set("Team Rocket"), set("Set 1 Unlimited"), set("151")];
    expect(bySlug(sets, "set-1-unlimited")?.name).toBe("Set 1 Unlimited");
    expect(bySlug(sets, "151")?.name).toBe("151");
  });

  it("is not fooled by case in the address bar", () => {
    expect(bySlug([set("Team Rocket")], "Team-Rocket")?.name).toBe("Team Rocket");
  });

  it("answers with nothing rather than a near miss", () => {
    // The caller turns this into notFound(). Guessing at the closest set would
    // mean a typo silently showing somebody a different part of their binder.
    expect(bySlug([set("Team Rocket")], "team-rockets")).toBeUndefined();
  });

  it("resolves a collision by collection order, deterministically", () => {
    // "Base Set" and "Base-Set" fold to the same address. The collection is
    // sorted newest first, so the newer one answers — documented rather than
    // prevented, because the alternative is a suffix nobody can predict.
    const sets = [set("Base-Set"), set("Base Set")];
    expect(bySlug(sets, "base-set")?.name).toBe("Base-Set");
  });
});
