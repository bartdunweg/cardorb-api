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

  it("tells malformed apart from too large", async () => {
    // Two different answers for the sender: 400 means fix the JSON, 413 means
    // send less. A caller that cannot tell them apart tells you to fix the
    // wrong thing.
    expect(await readJsonBody(req("{not json"), 100)).toEqual({ kind: "invalid" });
  });
});

describe("every route that reads a body caps it", () => {
  it("finds no uncapped req.json()", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry === "route.ts") {
          const src = readFileSync(path, "utf8");
          const reads = /\breq(uest)?\.json\(\)/.test(src);
          const caps = /readJsonBody|MAX_BODY_BYTES/.test(src);
          if (reads && !caps) offenders.push(path);
        }
      }
    };
    walk("src/app/api");

    // Nothing else bounds these: Next puts no limit on a route handler's body
    // and next.config.ts sets none. An uncapped handler lets the caller decide
    // how much memory to use.
    expect(
      offenders,
      `These read a JSON body with no size limit. Use readJsonBody() from ` +
        `@/lib/api/body with the right BODY_LIMIT:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("has a limit for every shape", () => {
    expect(Object.keys(BODY_LIMIT).length).toBeGreaterThan(4);
  });
});
