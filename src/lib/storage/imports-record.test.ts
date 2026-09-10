import { describe, expect, it, vi } from "vitest";

// `imports.ts` reaches a module marked server-only; the guard is a build-time concern, not this test's.
vi.mock("server-only", () => ({}));

/**
 * The `imports` row is the only trace an import leaves. Its insert used to have its error
 * discarded, so a refused insert meant every card was still written and nothing recorded it —
 * the history screen empty, and a run that died halfway leaving no sign it had ever started.
 */
describe("commit, when the imports row cannot be written", () => {
  it("says so rather than running silently", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation(
      (...a: unknown[]) => void logged.push(a.join(" ")),
    );

    const { commit } = await import("./imports");
    const db = {
      from: (table: string) =>
        table === "imports"
          ? {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: null, error: { message: "refused" } }),
                }),
              }),
              update: () => ({ eq: async () => ({ error: null }) }),
            }
          : {
              select: () => ({ eq: () => ({ count: 0, error: null }) }),
              upsert: async () => ({ error: null }),
            },
    };

    await commit(db as never, "u1", "csv", [], [], new Set());

    expect(logged.join("\n")).toContain("Import started with no record of it");
    vi.restoreAllMocks();
  });
});
