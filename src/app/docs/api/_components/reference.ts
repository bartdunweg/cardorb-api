import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * What the reference page says, decided here rather than while rendering.
 *
 * The page groups the contract's operations under its tags and labels each
 * with who may call it. Both are decisions — which tag wins when an operation
 * has several, what "same-origin" is called — and a decision inside a Server
 * Component is one nothing tests (R-STRUCT-007). So the component keeps the
 * markup and this module says what goes in it.
 */

export type Operation = {
  method: string;
  path: string;
  summary: string;
  description: string | null;
  deprecated: boolean;
  /** Who may call it, as the page prints it. */
  auth: string;
  /** Every status the contract lists, with what each means. */
  responses: { status: string; description: string }[];
  parameters: { name: string; where: string; description: string | null; required: boolean }[];
};

export type Section = { tag: string; description: string | null; operations: Operation[] };

type SecurityRequirement = Record<string, string[]>;
type RawOp = {
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags?: string[];
  security?: SecurityRequirement[];
  parameters?: RawParam[];
  responses?: Record<string, { description?: string; $ref?: string }>;
};
type RawParam = { name: string; in: string; description?: string; required?: boolean };
type RawSpec = {
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  security?: SecurityRequirement[];
  tags?: { name: string; description?: string }[];
  components?: { responses?: Record<string, { description?: string }> };
  paths: Record<string, Record<string, RawOp | RawParam[]>>;
};

const METHODS = ["get", "post", "patch", "put", "delete", "options", "head"];

/** The scheme names, as the page prints them. */
const SCHEME_LABEL: Record<string, string> = {
  bearer: "bearer token",
  session: "session cookie",
  passcode: "passcode (deprecated)",
  cron: "cron secret",
};

/** The contract, read from disk. At build time on Vercel, once. */
export function readSpec(root = process.cwd()): RawSpec {
  return parse(readFileSync(join(root, "public", "openapi.yaml"), "utf8")) as RawSpec;
}

/**
 * Who may call an operation, in words.
 *
 * `security: []` on an operation means no credential at all, and an operation
 * without a `security` key inherits the document's. Both spellings exist in
 * the contract and both have to come out right here, because "no key" is the
 * one thing a reader most needs to know.
 */
export function authLabel(op: { security?: SecurityRequirement[] }, spec: RawSpec): string {
  const requirements = op.security ?? spec.security ?? [];
  if (requirements.length === 0) return "no key";
  const names = requirements.flatMap((r) => Object.keys(r)).map((n) => SCHEME_LABEL[n] ?? n);
  return names.join(" or ");
}

/** The operations, grouped under the contract's tags in the order the contract lists them. */
export function sections(spec: RawSpec): Section[] {
  const byTag = new Map<string, Operation[]>();
  for (const tag of spec.tags ?? []) byTag.set(tag.name, []);

  for (const [path, item] of Object.entries(spec.paths)) {
    const shared = (item.parameters as RawParam[] | undefined) ?? [];
    for (const method of METHODS) {
      const raw = item[method] as RawOp | undefined;
      if (!raw) continue;
      // The first tag decides where it is filed; a second tag would file it
      // twice, and the contract does not use one.
      const tag = raw.tags?.[0] ?? "Other";
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push({
        method: method.toUpperCase(),
        path,
        summary: raw.summary ?? "",
        description: raw.description?.trim() || null,
        deprecated: raw.deprecated === true,
        auth: authLabel(raw, spec),
        parameters: [...shared, ...(raw.parameters ?? [])].map((p) => ({
          name: p.name,
          where: p.in,
          description: p.description ?? null,
          required: p.required === true || p.in === "path",
        })),
        responses: Object.entries(raw.responses ?? {}).map(([status, r]) => ({
          status,
          description:
            r.description ??
            spec.components?.responses?.[r.$ref?.split("/").pop() ?? ""]?.description ??
            "",
        })),
      });
    }
  }

  const described = new Map((spec.tags ?? []).map((t) => [t.name, t.description ?? null]));
  return [...byTag.entries()]
    .filter(([, ops]) => ops.length > 0)
    .map(([tag, operations]) => ({ tag, description: described.get(tag) ?? null, operations }));
}
