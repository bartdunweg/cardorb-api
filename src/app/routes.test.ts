import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Every href="/…" in this app points at a route that exists.
 *
 * Written after doing it twice. The settings index shipped links to
 * /settings/account and /settings/appearance in the same commit that did not
 * create them, and /collection/sets sat in the navigation as a 404 for a day.
 * Neither is visible from the outside: a wrong link compiles, renders, and looks
 * exactly like a right one until somebody presses it.
 *
 * Static rather than a crawl. A crawl needs the app running, which this suite
 * cannot do — node environment, no server, no jsdom — and it would only cover
 * the pages it managed to reach. Reading the App Router's own file layout is
 * both cheaper and more complete.
 */

const APP = "src/app";

/** Turn the app directory into the set of paths it answers. */
function routes(dir = APP, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;

    // Route groups — (app) — and parallel slots — @modal — are organisational
    // and contribute nothing to the URL.
    if (name.startsWith("(") || name.startsWith("@")) {
      out.push(...routes(path, prefix));
      continue;
    }
    // Private folders. _components and the like are never routes.
    if (name.startsWith("_")) continue;

    const segment = name.startsWith("[") ? ":param" : name;
    const here = `${prefix}/${segment}`;
    if (existsSync(join(path, "page.tsx")) || existsSync(join(path, "route.ts"))) out.push(here);
    out.push(...routes(path, here));
  }
  return out;
}

/** Does this literal path match a route, dynamic segments included? */
function answered(path: string, known: string[]): boolean {
  const want = path.split("/").filter(Boolean);
  return known.some((route) => {
    const have = route.split("/").filter(Boolean);
    if (have.length !== want.length) return false;
    return have.every((seg, i) => seg === ":param" || seg === want[i]);
  });
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("internal links", () => {
  const known = ["/", ...routes()];

  it("all point at a route that exists", () => {
    const broken: string[] = [];

    for (const file of walk(APP)) {
      const source = readFileSync(file, "utf8");
      // Both spellings. A link is as often a value in an array —
      // `{ href: "/settings/profile", title: … }` — as it is a JSX attribute,
      // and the first version of this test only knew the attribute. It passed
      // clean against a file whose links were all objects, which is to say it
      // would not have caught the bug it was written for.
      for (const m of source.matchAll(/href(?:=|:\s*)"(\/[a-z0-9/_-]*)"/gi)) {
        const path = m[1]!;
        if (!answered(path, known)) broken.push(`${path} (in ${file})`);
      }
    }

    expect(
      broken,
      `These link somewhere the app does not answer. A wrong href compiles, ` +
        `renders and looks exactly like a right one until somebody presses it.` +
        `\n  ${broken.join("\n  ")}`,
    ).toEqual([]);
  });

  it("found the routes it was meant to find", () => {
    // Guards the guard: a walk that silently matches nothing would pass every
    // assertion above while checking none of them.
    expect(known).toContain("/dashboard");
    // /settings is one page now; /settings/password is the one sub-route left,
    // and the one this walk would most easily miss (it lives outside the
    // (app) group, under app/settings/).
    expect(known).toContain("/settings");
    expect(known).toContain("/settings/password");
    expect(known.length).toBeGreaterThan(15);
  });
});
