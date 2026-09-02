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
