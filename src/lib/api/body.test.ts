import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BODY_LIMIT, readJsonBody } from "./body";

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://example.test/", { method: "POST", body, headers });

describe("readJsonBody", () => {
  it("returns the parsed body under the limit", async () => {
    const result = await readJsonBody<{ a: number }>(req('{"a":1}'), 100);
    expect(result).toEqual({ kind: "ok", body: { a: 1 } });
  });

  it("refuses on a declared content-length, before reading anything", async () => {
    // The header alone is enough. That is the point: a caller that declares
    // honestly is refused without the body being pulled into memory.
    const result = await readJsonBody(req("{}", { "content-length": "999999" }), 100);
    expect(result).toEqual({ kind: "too-large" });
  });

  it("refuses on what actually arrived, when the header lies", async () => {
    // content-length can be absent on a chunked request and can simply be
    // wrong on any request. Checking only the header checks a claim.
    const result = await readJsonBody(
      req(JSON.stringify({ a: "x".repeat(500) }), { "content-length": "10" }),
      100,
    );
    expect(result).toEqual({ kind: "too-large" });
  });

  it("measures the body in bytes, not in characters", async () => {
    // `raw.length` counts UTF-16 code units, and the limit is in bytes — the
    // declared content-length checked above is. So a cap written as 100 used to
    // accept 200 bytes of accented text and about 150 of CJK: every character
    // outside ASCII bought itself another byte or two for free.
    //
    // 60 accented characters wrapped in JSON: 68 UTF-16 units, 128 bytes. Under
    // a 100-byte cap the old check saw 68 and let it through.
    const payload = JSON.stringify({ a: "é".repeat(60) });
    expect(payload.length).toBeLessThan(100);
    expect(new TextEncoder().encode(payload).length).toBeGreaterThan(100);

    expect(await readJsonBody(req(payload), 100)).toEqual({ kind: "too-large" });
    // And the same body still arrives when the cap is genuinely big enough.
    expect(await readJsonBody(req(payload), 200)).toEqual({
      kind: "ok",
      body: { a: "é".repeat(60) },
    });
  });

  it("tells malformed apart from too large", async () => {
    // Two different answers for the sender: 400 means fix the JSON, 413 means
    // send less. A caller that cannot tell them apart tells you to fix the
    // wrong thing.
    expect(await readJsonBody(req("{not json"), 100)).toEqual({ kind: "invalid" });
  });

  it("calls no bytes at all invalid, unless the caller says what they mean", async () => {
    // JSON.parse("") throws, so an empty body was a 400 everywhere — including
    // on POST …/copies, whose own contract calls an empty body "one more
    // identical copy". Opt-in, because on every other route an empty body is a
    // caller that forgot one.
    expect(await readJsonBody(req(""), 100)).toEqual({ kind: "invalid" });
    expect(await readJsonBody(req(""), 100, { emptyIs: {} })).toEqual({ kind: "ok", body: {} });
    expect(await readJsonBody(req("  \n "), 100, { emptyIs: {} })).toEqual({
      kind: "ok",
      body: {},
    });
  });

  it("still calls a malformed body malformed, whatever an empty one means", async () => {
    // The distinction emptyIs must not erase: nothing sent and half an object
    // are different mistakes, and only one of them is a request.
    expect(await readJsonBody(req("{not json"), 100, { emptyIs: {} })).toEqual({
      kind: "invalid",
    });
  });
});

describe("every route that reads a body caps it", () => {
  /**
   * Both spellings, and only readJsonBody() counts as the cap.
   *
   * This check passed while two routes broke the rule it enforces, and it did so
   * on two independent counts. `cards/route.ts` and `collection/items/[id]/route.ts`
   * read their bodies with `req.text()` + `JSON.parse`, which never matched a
   * pattern looking for `req.json()`; and both declared a local `MAX_BODY_BYTES`,
   * which the exemption accepted as evidence of a cap. So the rule read
   * as enforced in the project rules while the only two routes breaking it were
   * invisible to the thing enforcing it.
   *
   * `req.text()` is the one that mattered. A new handler written that way with no
   * cap at all — the exact failure this file exists to prevent — was not caught
   * by any part of the old check.
   *
   * `MAX_BODY_BYTES` is deliberately no longer an escape. A hand-rolled limit is
   * how the duplication started; R-API-004 asks for readJsonBody() and a named
   * BODY_LIMIT, so that is what is checked.
   *
   * ── The call, in code, not the name in a sentence ──────────────────────────
   *
   * Two false passes had to be closed here, and both were found the same way:
   * by deleting the readJsonBody() call from cards/route.ts and checking this
   * test went red. It did not, twice.
   *
   *   1. Matching the bare name `readJsonBody` was satisfied by the `import`
   *      line, so a handler could import the helper, never call it, and pass.
   *      Hence the `\(`.
   *   2. Matching `readJsonBody(` was then satisfied by the *comment* in that
   *      same route explaining why the helper exists — prose naming the function
   *      the way prose does. Hence the strip below.
   *
   * main-landmark.test.ts hit exactly this second trap and solved it first: a
   * test that cannot tell an element from a sentence about one is a test that
   * punishes writing the sentence. The comment-stripping is lifted from there
   * rather than reinvented.
   *
   * ── And two more, which are why this reads handlers rather than files ──────
   *
   *   3. `reads` and `caps` were evaluated over the whole file. A route file
   *      holds up to four handlers, and one of them calling readJsonBody() made
   *      the file "capped": a new POST beside a capped PATCH could read its body
   *      by hand, uncapped, and never appear here. The walk below splits a file
   *      at each `export function <METHOD>` and asks the question per handler,
   *      which is the unit the rule is actually about.
   *   4. Nothing looked at the limit. `readJsonBody(req, 100_000_000)` satisfied
   *      "calls readJsonBody()" completely, and R-API-004 asks for a *named*
   *      BODY_LIMIT — the number is meant to be arguable at the call site, which
   *      a literal is not. Every call is now held to `BODY_LIMIT.<something>`.
   */

  /** The source with its comments removed — see main-landmark.test.ts. */
  const code = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "") // /* block */ and /** doc */
      .replace(/^\s*\/\/.*$/gm, ""); // // line

  const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"];

  /** Every route.ts under src/app/api, comments already gone. */
  function routes(dir = "src/app/api"): { path: string; src: string }[] {
    const out: { path: string; src: string }[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...routes(path));
      else if (entry === "route.ts") out.push({ path, src: code(readFileSync(path, "utf8")) });
    }
    return out;
  }

  /** One entry per exported handler, carrying only that handler's own body. */
  function handlers(): { where: string; body: string }[] {
    const out: { where: string; body: string }[] = [];
    for (const { path, src } of routes()) {
      const marks: { method: string; at: number }[] = [];
      for (const m of src.matchAll(/export (?:async )?function ([A-Z]+)\b/g)) {
        if (METHODS.includes(m[1]!)) marks.push({ method: m[1]!, at: m.index! });
      }
      marks.sort((a, b) => a.at - b.at);
      for (const [i, mark] of marks.entries()) {
        out.push({
          where: `${mark.method} ${path}`,
          body: src.slice(mark.at, marks[i + 1]?.at ?? src.length),
        });
      }
    }
    return out;
  }

  it("reads at least one handler per route file, or the walk below proves nothing", () => {
    // The check every source-reading test needs and this one did not have: a
    // regex that stops matching reports an empty list of offenders, which reads
    // exactly like a clean repository.
    expect(handlers().length).toBeGreaterThan(routes().length);
  });

  it("finds no uncapped body read, in either spelling, in any single handler", () => {
    const offenders = handlers()
      .filter(({ body }) => /\breq(uest)?\.(json|text)\(\)/.test(body))
      .filter(({ body }) => !/\breadJsonBody\s*(<[^(]*>)?\s*\(/.test(body))
      .map(({ where }) => where);

    // Nothing else bounds these: Next puts no limit on a route handler's body
    // and next.config.ts sets none. An uncapped handler lets the caller decide
    // how much memory to use.
    expect(
      offenders,
      `These read a JSON body with no size limit. Use readJsonBody() from ` +
        `@/lib/api/body with the right BODY_LIMIT:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("passes a named BODY_LIMIT, never a number written at the call site", () => {
    const limits: { where: string; limit: string }[] = [];
    for (const { where, body } of handlers()) {
      for (const m of body.matchAll(/\breadJsonBody\s*(?:<[^(]*>)?\s*\(\s*[^,()]+,\s*([^,)]+)/g)) {
        limits.push({ where, limit: m[1]!.trim() });
      }
    }

    // A regex that has quietly stopped matching would otherwise report a clean
    // repository. Ten handlers read a body; this must find all of them.
    expect(limits.length).toBeGreaterThanOrEqual(8);

    const unnamed = limits
      .filter(({ limit }) => !/^BODY_LIMIT\.\w+$/.test(limit))
      .map(({ where, limit }) => `${where} → ${limit}`);
    expect(
      unnamed,
      `R-API-004 asks for a named BODY_LIMIT, so the number is arguable where it ` +
        `is used: a password is not a CSV. These wrote one instead:\n${unnamed.join("\n")}`,
    ).toEqual([]);

    // And every name it passes has to be one that exists — `BODY_LIMIT.cards`
    // for `BODY_LIMIT.card` is `undefined`, which compares false against every
    // size there is and caps nothing at all.
    const unknown = limits
      .map(({ where, limit }) => ({ where, key: limit.slice("BODY_LIMIT.".length) }))
      .filter(({ key }) => key in BODY_LIMIT === false)
      .map(({ where, key }) => `${where} → BODY_LIMIT.${key}`);
    expect(unknown).toEqual([]);
  });

  it("has a limit for every shape", () => {
    expect(Object.keys(BODY_LIMIT).length).toBeGreaterThan(4);
  });
});
