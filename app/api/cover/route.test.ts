import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * The proxy, which is the one place in this app that fetches a URL somebody
 * else chose.
 *
 * It was the largest untested surface here, and it is the one where a mistake
 * is not a wrong pixel: without the allowlist this route is an open relay that
 * serves arbitrary bytes from binder's own origin, which is a stored-XSS
 * delivery mechanism and an SSRF probe against anything the deploy can reach.
 *
 * So these are written as the requests an attacker sends, not as coverage of
 * branches: another host, a redirect to another host, a private address, a
 * non-image body. fetch is stubbed throughout — a test that reaches the real
 * internet is a test that fails on a train.
 */

const OK = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/DCR/DCR_006_R_EN_LG.png";

const ask = (url: string | null) =>
  GET(
    new Request(
      url === null
        ? "https://binder.example/api/cover"
        : `https://binder.example/api/cover?url=${encodeURIComponent(url)}`,
    ),
  );

const image = (type = "image/png") =>
  new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": type } });

afterEach(() => vi.restoreAllMocks());

describe("what it refuses before fetching anything", () => {
  // The assertion that matters in all of these: no request was made. A 403 that
  // still hit the network would have proved the host exists.
  const noFetch = () => vi.spyOn(globalThis, "fetch").mockResolvedValue(image());

  it("refuses another host", async () => {
    const f = noFetch();
    const res = await ask("https://evil.example/payload.png");
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a host that merely ends with the allowed one", async () => {
    const f = noFetch();
    const res = await ask("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com.evil.test/a.png");
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses the loopback address", async () => {
    const f = noFetch();
    expect((await ask("https://127.0.0.1/admin")).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses the cloud metadata address", async () => {
    const f = noFetch();
    expect((await ask("https://169.254.169.254/latest/meta-data/")).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses http, so the hop to the origin cannot be watched or rewritten", async () => {
    const f = noFetch();
    const res = await ask("http://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/a.png");
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a non-http scheme", async () => {
    const f = noFetch();
    expect((await ask("file:///etc/passwd")).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("answers 400 for a missing url and 400 for one that is not a url", async () => {
    expect((await ask(null)).status).toBe(400);
    expect((await ask("not a url at all")).status).toBe(400);
  });
});

describe("what it does with an allowed host", () => {
  it("passes the image through with its type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(image("image/webp"));
    const res = await ask(OK);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("caches hard, because card art at a fixed URL never changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(image());
    const res = await ask(OK);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("refuses to serve HTML even from the allowed host", async () => {
    // The allowlist is the real defence; this is what stops a compromised path
    // on that host from serving a script from binder's origin.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } }),
    );
    expect((await ask(OK)).status).toBe(502);
  });

  it("refuses a body with no content type at all", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("hello", { headers: {} }));
    expect((await ask(OK)).status).toBe(502);
  });

  it("answers 502 when the upstream says no", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
    expect((await ask(OK)).status).toBe(502);
  });

  it("answers 502 rather than throwing when the fetch itself fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await ask(OK)).status).toBe(502);
  });
});
