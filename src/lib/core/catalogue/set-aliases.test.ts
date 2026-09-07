import { describe, expect, it } from "vitest";
import { collectionSetNames, galleryParent, isGalleryNumber, ptcgSetName } from "./set-aliases";

describe("set aliases", () => {
  it("names the sets the two vocabularies disagree on", () => {
    expect(ptcgSetName("SV Black Star Promos")).toBe("Scarlet & Violet Black Star Promos");
    expect(ptcgSetName("Wizard Black Star Promos")).toBe("Wizards Black Star Promos");
    // A print run, not a set: 102 rows of this collection are filed under it.
    expect(ptcgSetName("Set 1 Unlimited")).toBe("Base");
    expect(ptcgSetName("Set 1 Shadowless")).toBe("Base");
    // The collection names the first set of the series after the series; the catalogue does not.
    expect(ptcgSetName("Scarlet & Violet Base")).toBe("Scarlet & Violet");
  });

  it("leaves a set both call the same thing alone", () => {
    expect(ptcgSetName("Jungle")).toBeNull();
    expect(ptcgSetName("Silver Tempest")).toBeNull();
  });

  it("answers the other way too, so a browse of a set finds the rows filed under its other names", () => {
    expect(collectionSetNames("Base")).toEqual(
      expect.arrayContaining(["base", "set1unlimited", "set1shadowless", "set1"]),
    );
    expect(collectionSetNames("Scarlet & Violet")).toEqual(
      expect.arrayContaining(["scarletviolet", "scarletvioletbase"]),
    );
    // A gallery set is filed under its parent, which the join has to look under as well.
    expect(collectionSetNames("Silver Tempest Trainer Gallery")).toContain("silvertempest");
  });

  it("knows a gallery by its name and its numbers", () => {
    expect(galleryParent("Crown Zenith Galarian Gallery")).toBe("Crown Zenith");
    expect(galleryParent("Crown Zenith")).toBeNull();
    expect(isGalleryNumber("TG05")).toBe(true);
    expect(isGalleryNumber("GG12")).toBe(true);
    expect(isGalleryNumber("117")).toBe(false);
  });
});
