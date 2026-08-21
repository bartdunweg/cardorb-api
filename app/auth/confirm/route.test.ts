import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where an emailed link lands, and the one thing it now records on the way past.
 *
 * `/settings/password` serves two callers through one screen and has no way of
 * its own to tell them apart. This route does: it receives `type=recovery` and
 * exchanges it. So it leaves a marker, and the tests here are about when it does
 * and does not. See ADR-0082 and lib/api/recovery.ts.
 *
 * Worth knowing: before this, `type=recovery` had no test coverage of any kind.
 * `visual/auth.setup.ts` exercises this route with `type=magiclink` only.
 */

vi.mock("server-only", () => ({}));

let otpFails = false;
const verifyOtp = vi.fn(async () =>
  otpFails ? { error: { message: "expired" } } : { error: null },
);

vi.mock("../../../lib/storage/supabase", () => ({
  configured: () => true,
  serverClient: async () => ({ auth: { verifyOtp } }),
}));

const { GET } = await import("./route");
const { RECOVERY_MARKER, RECOVERY_MARKER_PATH } = await import("../../../lib/api/recovery");

const visit = (type: string, next = "/settings/password") =>
  GET(
    new Request(
      `https://cardorb.example/auth/confirm?token_hash=abc&type=${type}&next=${encodeURIComponent(next)}`,
    ),
  );

beforeEach(() => {
  otpFails = false;
  verifyOtp.mockClear();
});

describe("GET /auth/confirm", () => {
  it("marks a recovery arrival", async () => {
    const res = await visit("recovery");
    const marker = res.cookies.get(RECOVERY_MARKER);
    expect(marker?.value).toBe("1");
    // httpOnly because nothing in the browser reads it — the page reads it on
    // the server and passes a boolean down. Scoped to the one path that does.
    expect(marker?.httpOnly).toBe(true);
    expect(marker?.path).toBe(RECOVERY_MARKER_PATH);
    // Short-lived, because nothing clears it: the page that reads it is a
    // Server Component and cannot write cookies either.
    expect(marker?.maxAge).toBeGreaterThan(0);
    expect(marker?.maxAge).toBeLessThanOrEqual(15 * 60);
  });

  it("marks nothing on any other kind of link", async () => {
    // A magic link is how the visual harness signs in, and how somebody
    // confirms an address. Neither is a recovery, and neither should hide the
    // current-password field on a screen they might visit later.
    for (const type of ["magiclink", "signup", "email_change"]) {
      verifyOtp.mockClear();
      const res = await visit(type);
      expect(res.cookies.get(RECOVERY_MARKER), `${type} should leave no marker`).toBeUndefined();
    }
  });

  it("marks nothing when the token is refused", async () => {
    // The redirect here goes to /login, and a marker riding along would sit in
    // the browser waiting for a later, deliberate visit to the password screen —
    // where it would hide the field that visit is supposed to show.
    otpFails = true;
    const res = await visit("recovery");
    expect(res.cookies.get(RECOVERY_MARKER)).toBeUndefined();
    expect(res.headers.get("location")).toContain("/login");
  });

  it("still only ever redirects within this app", async () => {
    // Unchanged by this work and asserted because it is now sharing a function
    // with a cookie write: an emailed link must not be able to bounce a freshly
    // authenticated visitor off this domain.
    const res = await visit("recovery", "https://evil.example/steal");
    expect(res.headers.get("location")).toBe("https://cardorb.example/cards");
  });
});
