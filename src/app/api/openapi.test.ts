import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * `public/openapi.yaml` describes exactly the routes under `src/app/api/v1`.
 *
 * The contract is only worth having while it is true, and nothing but a test
 * keeps a document true. So this reads the App Router's own file layout — the
 * same walk routes.test.ts does — and holds it against the spec in both
 * directions: a handler with no operation, and an operation with no handler,
 * both fail here, naming the pair.
 *
 * Only `/api/v1`. `/api/cover` is the web tool's image proxy for scans that
 * come from Limitless; it answers a picture, not JSON, and no client is meant
 * to call it by name.
 *
 * Every error response is also held to one shape: each 4xx and 5xx either
 * references the shared `Error` schema or extends it. That is the rule the
 * clients rely on — `{ error: "<sentence>" }` at a status they can branch on —
 * and it is cheaper to check here than to read 28 route files.
 */

const API = "src/app/api/v1";
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"] as const;

type Op = `${string} ${string}`;

/** `src/app/api/v1/catalog/sets/[setId]/route.ts` → `/v1/catalog/sets/{setId}`. */
function fromFiles(dir = API, prefix = "/v1"): Op[] {
  const out: Op[] = [];
  const route = join(dir, "route.ts");
  if (existsSync(route)) {
    const source = readFileSync(route, "utf8");
    for (const method of METHODS) {
      if (new RegExp(`export (async )?function ${method}\\b`).test(source)) {
        out.push(`${method} ${prefix}`);
      }
    }
  }
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    if (name.startsWith("_") || name.startsWith("(")) continue;
    const segment = name.startsWith("[") ? `{${name.slice(1, -1)}}` : name;
    out.push(...fromFiles(path, `${prefix}/${segment}`));
  }
  return out;
}

type Spec = {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, Response> };
};
type Response = { content?: { "application/json"?: { schema?: Schema } } };
type Schema = { $ref?: string; allOf?: Schema[] };

const spec = parse(readFileSync("public/openapi.yaml", "utf8")) as Spec;

function fromSpec(): Op[] {
  const out: Op[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const key of Object.keys(item)) {
      if (key === "parameters") continue;
      out.push(`${key.toUpperCase()} ${path}`);
    }
  }
  return out;
}

const sorted = (ops: Op[]) => [...ops].sort();

describe("openapi.yaml", () => {
  it("is OpenAPI 3.1", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
  });

  it("describes every route handler under /api/v1, and nothing else", () => {
    expect(sorted(fromSpec())).toEqual(sorted(fromFiles()));
  });

  it("answers every failure with the Error shape", () => {
    const isError = (schema: Schema | undefined): boolean => {
      if (!schema) return false;
      if (schema.$ref === "#/components/schemas/Error") return true;
      return (schema.allOf ?? []).some(isError);
    };
    const wrong: string[] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (method === "parameters") continue;
        const responses = (op as { responses: Record<string, Response | { $ref: string }> })
          .responses;
        for (const [status, response] of Object.entries(responses)) {
          if (Number(status) < 400) continue;
          // A 403 preflight answers an empty body — no JSON, nothing to shape.
          if (method === "options") continue;
          const resolved =
            "$ref" in response
              ? spec.components.responses[response.$ref.split("/").pop()!]
              : response;
          if (!isError(resolved?.content?.["application/json"]?.schema)) {
            wrong.push(`${method.toUpperCase()} ${path} ${status}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * Every status a handler can answer is a status the contract carries.
   *
   * The two-directional walk above holds paths and methods to the spec and says
   * nothing about what any of them *answers*, which is where the drift actually
   * was: `POST /v1/cards` could 404 on a folder that is not yours, both
   * `/v1/catalog/sets` routes could 400 on a language nobody has, `GET
   * /v1/imports` could 403 and 429 through the guard, `POST /v1/import/csv`
   * could 415 and 502 — none of them in the file two clients generate against.
   * Every one of those is a real answer sent to a real client that has no
   * branch for it.
   *
   * Read out of the source rather than by calling anything, so it costs a regex
   * and not a running route: `apiError(<status>`, `refuse("<key>")` through
   * REFUSALS, `unavailable()`, `storeErrorResponse()`, a literal `status:`, and
   * the statuses the two door functions can answer on their own. Comments are
   * stripped first, for the reason body.test.ts strips them: prose naming
   * `apiError(404` is a sentence about a status, not a status.
   *
   * One direction only, deliberately. "The spec documents a status no handler
   * can produce" cannot be decided by reading source — /v1/health's 503 is a
   * bare number handed to a local helper, and a static reader that insisted on
   * finding it would be asking every route to be written its way. Documenting a
   * status too many costs a client a branch it never takes; answering one that
   * is not documented costs it the branch it needed.
   */
  it("documents every status its handlers can answer", () => {
    const REFUSAL_STATUS: Record<string, number> = {
      invalid: 400,
      signIn: 401,
      forbidden: 403,
      tooLarge: 413,
      notJson: 415,
      tooMany: 429,
      catalogue: 502,
      noDatabase: 503,
    };
    const withoutComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    /** One entry per exported handler, with just that handler's body. */
    const handlers = (dir = API, prefix = "/v1"): { op: Op; body: string }[] => {
      const out: { op: Op; body: string }[] = [];
      const route = join(dir, "route.ts");
      if (existsSync(route)) {
        const src = withoutComments(readFileSync(route, "utf8"));
        const marks: { method: string; at: number }[] = [];
        for (const m of src.matchAll(/export (?:async )?function ([A-Z]+)\b/g)) {
          if ((METHODS as readonly string[]).includes(m[1]!))
            marks.push({ method: m[1]!, at: m.index! });
        }
        marks.sort((a, b) => a.at - b.at);
        for (const [i, mark] of marks.entries()) {
          const end = marks[i + 1]?.at ?? src.length;
          out.push({ op: `${mark.method} ${prefix}`, body: src.slice(mark.at, end) });
        }
      }
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (!statSync(path).isDirectory()) continue;
        if (name.startsWith("_") || name.startsWith("(")) continue;
        const segment = name.startsWith("[") ? `{${name.slice(1, -1)}}` : name;
        out.push(...handlers(path, `${prefix}/${segment}`));
      }
      return out;
    };

    const answered = (body: string): number[] => {
      const found = new Set<number>();
      for (const m of body.matchAll(/\bapiError\s*\(\s*(\d{3})/g)) found.add(Number(m[1]));
      for (const m of body.matchAll(/\brefuse\s*\(\s*"(\w+)"/g)) {
        const status = REFUSAL_STATUS[m[1]!];
        if (status) found.add(status);
      }
      if (/\bunavailable\s*\(/.test(body)) found.add(503);
      // The helper answers 503 for an unconfigured store and 502 for one that
      // threw, so a route that reaches for it can send either.
      if (/\bstoreErrorResponse\s*\(/.test(body)) {
        found.add(502);
        found.add(503);
      }
      for (const m of body.matchAll(/status:\s*(\d{3})/g)) found.add(Number(m[1]));
      for (const m of body.matchAll(/status:\s*[\w.]+\s*\?\s*(\d{3})\s*:\s*(\d{3})/g)) {
        found.add(Number(m[1]));
        found.add(Number(m[2]));
      }
      // The door itself, whatever the handler goes on to do. authorise() can
      // answer all four before a line of the route runs; authoriseWrite() adds
      // the content-type refusal in front of them.
      if (/\bauthoriseWrite\s*\(/.test(body)) found.add(415);
      if (/\bauthorise(Write)?\s*\(/.test(body)) for (const s of [401, 403, 429, 503]) found.add(s);
      return [...found].filter((n) => n >= 400).sort();
    };

    const undocumented: string[] = [];
    for (const { op, body } of handlers()) {
      const [method, path] = op.split(" ") as [string, string];
      const operation = spec.paths[path]?.[method.toLowerCase()] as
        { responses?: Record<string, unknown> } | undefined;
      const documented = new Set(Object.keys(operation?.responses ?? {}));
      for (const status of answered(body)) {
        if (!documented.has(String(status))) undocumented.push(`${op} ${status}`);
      }
    }

    expect(
      undocumented,
      `These handlers answer a status openapi.yaml does not describe. A client ` +
        `generated from the contract has no branch for it:\n${undocumented.join("\n")}`,
    ).toEqual([]);
  });

  it("resolves every $ref", () => {
    const text = readFileSync("public/openapi.yaml", "utf8");
    const missing: string[] = [];
    for (const m of text.matchAll(/\$ref: "#\/components\/(\w+)\/(\w+)"/g)) {
      const [, kind, name] = m;
      const section = (spec.components as unknown as Record<string, Record<string, unknown>>)[
        kind!
      ];
      if (!section?.[name!]) missing.push(`${kind}/${name}`);
    }
    expect(missing).toEqual([]);
  });
});
