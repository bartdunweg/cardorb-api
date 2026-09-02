import { describe, expect, it } from "vitest";
import { authLabel, readSpec, sections } from "./reference";

const spec = readSpec();

describe("authLabel", () => {
  it("says 'no key' for an operation that opts out", () => {
    expect(authLabel({ security: [] }, spec)).toBe("no key");
  });

  it("inherits the document's schemes when the operation names none", () => {
    expect(authLabel({}, spec)).toBe("bearer token or session cookie");
  });

  it("names a scheme the page has no word for as it is", () => {
    expect(authLabel({ security: [{ mystery: [] }] }, spec)).toBe("mystery");
  });
});

describe("sections", () => {
  const all = sections(spec);

  it("follow the contract's tag order and drop empty tags", () => {
    const tags = (spec.tags ?? []).map((t) => t.name);
    expect(all.map((s) => s.tag)).toEqual(tags.filter((t) => all.some((s) => s.tag === t)));
    for (const s of all) expect(s.operations.length).toBeGreaterThan(0);
  });

  it("file every operation exactly once", () => {
    const seen = all.flatMap((s) => s.operations.map((o) => `${o.method} ${o.path}`));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("carry a path parameter as required and a shared one on every method", () => {
    const item = all
      .flatMap((s) => s.operations)
      .filter((o) => o.path === "/v1/collection/items/{id}");
    expect(item.length).toBeGreaterThan(1);
    for (const op of item) {
      expect(op.parameters.find((p) => p.name === "id")).toMatchObject({
        where: "path",
        required: true,
      });
    }
  });

  it("resolve a referenced response to its description", () => {
    const collection = all
      .flatMap((s) => s.operations)
      .find((o) => o.method === "GET" && o.path === "/v1/collection")!;
    const unauthorised = collection.responses.find((r) => r.status === "401")!;
    expect(unauthorised.description).toMatch(/sign in/i);
  });
});
