import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every generated data file a script names has to be a file that is there.
 *
 * lib/core moved under src/ and four `join(ROOT, "lib", "core", …)` in three scripts did
 * not move with it. Nothing failed at import: the paths are strings, so
 * snapshot-collection-value.mjs read `existsSync(IDS)` as "no cache", re-resolved all
 * 1,553 Cardmarket ids from TCGdex, and then died on writeFileSync with ENOENT — after
 * the requests, so every run paid for them and kept nothing. cardmarket-links.mjs and
 * backfill-finish.mjs failed the same way for the same reason.
 *
 * A typecheck cannot see this and neither can a lint. It is checked here because the only
 * other thing that would have caught it is running each script against the live database,
 * which is not something a test may do.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

/**
 * The paths one script builds out of its own ROOT, as that script builds them.
 *
 * ROOT is the repository root in most of these — the .env read and docs/ are there — and
 * already ends in src/ in one, so the segments after it are what says where lib/core is.
 */
function generatedPaths(source: string): string[] {
  const root = /const ROOT = (.+);/.exec(source)?.[1]?.includes('"src"') ? join(REPO, "src") : REPO;
  const paths: string[] = [];
  for (const call of source.matchAll(/join\(ROOT,\s*([^)]*)\)/g)) {
    const parts = [...call[1]!.matchAll(/"([^"]*)"/g)].map((p) => p[1]!);
    if (parts.at(-1)?.endsWith(".generated.json")) paths.push(join(root, ...parts));
  }
  return paths;
}

describe("the scripts' generated data files", () => {
  const scripts = readdirSync(join(REPO, "scripts")).filter((f) => f.endsWith(".mjs"));

  it("is a list with something in it, or this test asserts nothing", () => {
    expect(
      scripts.flatMap((f) => generatedPaths(readFileSync(join(REPO, "scripts", f), "utf8"))),
    ).not.toHaveLength(0);
  });

  it.each(scripts)("%s names only files that exist", (file) => {
    for (const path of generatedPaths(readFileSync(join(REPO, "scripts", file), "utf8"))) {
      expect(existsSync(path), `${file} names ${path}, which is not there`).toBe(true);
    }
  });
});
