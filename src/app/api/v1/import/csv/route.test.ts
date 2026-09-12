import { beforeEach, describe, expect, it, vi } from "vitest";
import { importKey } from "@/lib/core/collection/import-match";

/**
 * The two halves of the endpoint that a client's screen is built on: which rows
 * come back, and which rows a commit is told to leave alone.
 *
 * Both are easy to get subtly wrong in a way no type catches. A line number
 * that slips by one writes a different card than the one somebody unticked, and
 * an `existing` flag computed against the wrong key marks every row or none.
 */

// imports.ts reaches a module marked server-only; the guard is a build-time
// concern, not this test's, and importing the real preview() needs it gone.
vi.mock("server-only", () => ({}));

const authoriseWrite = vi.fn();
const heldKeys = vi.fn();
const commit = vi.fn();

vi.mock("@/lib/api/guard", () => ({
  authoriseWrite: (...a: unknown[]) => authoriseWrite(...a),
  refused: (r: { status?: number }) => "status" in r,
  readHeaders: () => ({}),
}));
vi.mock("@/lib/api/viewer", () => ({ bearer: () => "t" }));
vi.mock("@/lib/storage/collection", () => ({ clientFor: async () => ({}) }));
vi.mock("@/lib/storage/imports", async (original) => ({
  // preview() is the real one: it is the thing whose counts the answer carries.
  ...(await original<Record<string, unknown>>()),
  heldKeys: (...a: unknown[]) => heldKeys(...a),
  commit: (...a: unknown[]) => commit(...a),
}));
vi.mock("next/cache", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  revalidateTag: () => {},
}));
vi.mock("@/lib/api/web-cache", () => ({ forgetOnTheWeb: async () => {} }));

const { POST } = await import("./route");

const CSV = [
  "Name,Set,Number,Quantity",
  "Pikachu,Base Set,58,1",
  "Charizard,Base Set,4,1",
  "Mew,Base Set,151,1",
].join("\n");

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("https://api.cardorb.com/v1/import/csv", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify({ csv: CSV, ...body }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authoriseWrite.mockResolvedValue({ userId: "me-uuid", email: "me@example.com", username: "me" });
  heldKeys.mockResolvedValue({ keys: new Set<string>(), titleOf: (s: string) => s });
  commit.mockResolvedValue({
    seen: 3,
    added: 3,
    skipped: 0,
    notOwned: 0,
    existing: 0,
    excluded: 0,
    total: 1_600,
  });
});

describe("POST /api/v1/import/csv, previewing", () => {
  it("hands back every row with the line it came from", async () => {
    const body = await (await post({})).json();

    expect(body.rows.map((r: { line: number; name: string }) => [r.line, r.name])).toEqual([
      [2, "Pikachu"],
      [3, "Charizard"],
      [4, "Mew"],
    ]);
  });

  it("says which rows name a card already held", async () => {
    heldKeys.mockResolvedValue({
      keys: new Set([importKey({ name: "Charizard", setName: "Base Set", number: "4" })]),
      titleOf: (s: string) => s,
    });

    const body = await (await post({})).json();

    expect(body.rows.map((r: { name: string; existing: boolean }) => [r.name, r.existing])).toEqual(
      [
        ["Pikachu", false],
        ["Charizard", true],
        ["Mew", false],
      ],
    );
    expect(body.existing).toBe(1);
  });

  it("is the dry run of the call it is, exclude and all", async () => {
    // A preview is the commit stopping one step early, so it answers for the
    // request it was given: a caller asking what an import with line 3 struck
    // off would do is told about two rows, not three. A client that wants the
    // whole list to tick in simply does not send exclude, which is what
    // cardorb-web's import dialog does.
    const body = await (await post({ exclude: [3] })).json();

    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(["Pikachu", "Mew"]);
    expect(body.seen).toBe(3);
  });
});

describe("POST /api/v1/import/csv, committing", () => {
  it("writes every row but the lines struck off, and counts them apart", async () => {
    await post({ commit: true, exclude: [3] });

    const [, , , rows, , , , excluded] = commit.mock.calls[0]!;
    expect((rows as { name: string }[]).map((r) => r.name)).toEqual(["Pikachu", "Mew"]);
    expect(excluded).toBe(1);
  });

  it("shrugs at a line that is not in the file", async () => {
    await post({ commit: true, exclude: [99] });

    const [, , , rows, , , , excluded] = commit.mock.calls[0]!;
    expect(rows).toHaveLength(3);
    expect(excluded).toBe(0);
  });
});
