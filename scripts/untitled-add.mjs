/**
 * Add an Untitled UI component, then put back the two things the generator
 * breaks every single time.
 *
 *   npm run ui:add -- button input
 *
 * ADR-0054 recorded both of these as "re-run the fixes after every add", which
 * was a note asking a person to remember something. This is that note, executed.
 * Both fixes are idempotent, so running it on an unchanged tree does nothing.
 *
 * ── The two fixes ──────────────────────────────────────────────────────────
 *
 * 1. The generator writes `import React, { … } from "react"` into every
 *    component. Nothing uses the default binding under the modern JSX
 *    transform, and this project's `tsc --noEmit` fails on it (TS6133).
 *
 * 2. It writes `/* eslint-disable @typescript-eslint/no-explicit-any *​/` into
 *    utils/is-react-component.ts. This project does not enable that rule, so
 *    the directive is itself the warning, and `--max-warnings 0` fails on it.
 *
 * Neither is a disagreement worth carrying upstream: they are true of Untitled
 * UI's default template and not of this repository's config. If a future
 * version stops emitting them, both fixes become no-ops rather than errors —
 * which is why this reports what it changed rather than asserting it had to.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// With no component named, the add step is skipped and only the fixes run. That
// is the useful default after someone has called `npx untitledui add` by hand,
// which is what the tool's own docs and the MCP server both tell you to do.
const names = process.argv.slice(2).filter((a) => !a.startsWith("-"));

for (const name of names) {
  console.log(`\n  untitledui add ${name}`);
  execFileSync("npx", ["--yes", "untitledui@latest", "add", name, "--yes"], { stdio: "inherit" });
}

/** Every .ts/.tsx under the vendored trees. */
function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const fixed = [];

for (const dir of ["components", "utils"]) {
  for (const file of sources(dir)) {
    const before = readFileSync(file, "utf8");
    let after = before;

    // 1. `import React, { a, b } from "react"` → `import { a, b } from "react"`.
    //    Only the form with named imports beside it; a lone default import
    //    would be someone using React.* on purpose and is left alone.
    after = after.replace(
      /^import React, \{([^}]*)\} from "react";$/m,
      'import {$1} from "react";',
    );

    // 2. The eslint-disable for a rule this project does not turn on.
    after = after.replace(/^\/\* eslint-disable @typescript-eslint\/no-explicit-any \*\/\n/m, "");

    if (after !== before) {
      writeFileSync(file, after);
      fixed.push(file);
    }
  }
}

console.log(
  fixed.length
    ? `\n  patched ${fixed.length} file(s) the generator would have failed on:\n    ${fixed.join("\n    ")}`
    : "\n  nothing to patch — the generator's output already passes this project's checks",
);
console.log("\n  now run: ./scripts/verify.sh\n");
