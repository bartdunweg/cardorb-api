import { describe, expect, it } from "vitest";
import { catalogueCardId } from "./card-id";

describe("catalogueCardId", () => {
  it("restores the question mark TCGdex keeps encoded in Unown ?'s id", () => {
    expect(catalogueCardId("exu-?")).toBe("exu-%3F");
  });

  it("leaves every other id as it came", () => {
    for (const id of ["exu-%3F", "exu-!", "sv03-125", "SM5+-008", "mep-Museum"])
      expect(catalogueCardId(id)).toBe(id);
  });
});
