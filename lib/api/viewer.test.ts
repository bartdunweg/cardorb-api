import { describe, expect, it, vi } from "vitest";
import type { Viewer } from "./viewer";

// viewer.ts is "server-only" and reaches for a Supabase client at import time;
// neither is what displayNameOf() is about, so both are stubbed away. Same
// approach guard.test.ts takes with viewer.ts itself.
vi.mock("server-only", () => ({}));
vi.mock("../storage/supabase", () => ({ serverClient: async () => null, userClient: () => null }));

const { displayNameOf } = await import("./viewer");

/**
 * What to call somebody, and the order the fallbacks run in.
 *
 * Written because the landing page used to greet every signed-in visitor with
 * OWNER_NAME — "Signed in as Bart", to people who are not Bart. The fix is only
 * as good as its fallback chain: an account with no display name still has to
 * be greeted with something that is theirs.
 */
const somebody = (over: Partial<Viewer>): Pick<Viewer, "displayName" | "username" | "email"> => ({
  displayName: null,
  username: "ash-k",
  email: "ash@example.com",
  ...over,
});

describe("displayNameOf", () => {
  it("prefers the name the person chose", () => {
    expect(displayNameOf(somebody({ displayName: "Ash Ketchum" }))).toBe("Ash Ketchum");
  });

  it("falls back to the username when no display name is set", () => {
    expect(displayNameOf(somebody({}))).toBe("ash-k");
  });

  it("treats a whitespace-only display name as unset", () => {
    // A field somebody cleared by typing spaces is not a name, and greeting
    // them with it would render as "Signed in as ".
    expect(displayNameOf(somebody({ displayName: "   " }))).toBe("ash-k");
  });

  it("falls back to the address's local part when there is no profile row", () => {
    // The unsupported state viewerFrom() guards against rather than crashes in.
    expect(displayNameOf(somebody({ username: "" }))).toBe("ash");
  });

  it("never renders an empty greeting", () => {
    expect(displayNameOf({ displayName: null, username: "", email: "" })).toBe("your account");
  });
});
