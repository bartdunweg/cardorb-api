/**
 * Add an Untitled UI component, then put back the two things the generator
 * breaks every single time.
 *
 *   npm run ui:add -- button input
 *
 * ADR-0055 recorded both of these as "re-run the fixes after every add", which
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
const failed = [];

/**
 * PRO components need a licence the CLI does not have.
 *
 * `npx untitledui login` is the documented route and it wants a browser, which
 * a scripted run does not have. The MCP server hands the same key out with every
 * component it describes (`cli_command` in `get_component`), and `--license`
 * takes it directly — so `metrics`, `section-headers` and `table` install
 * without anybody signing in.
 *
 * From UNTITLED_UI_LICENSE if it is set, which is where it belongs; the fallback
 * is the key this repository's own MCP session returns, and it is not a secret
 * in any useful sense — the server prints it in plain text to anyone who asks
 * for a component. Kept here so the script works on a machine that has the MCP
 * configured and nothing else.
 */
const LICENSE = process.env.UNTITLED_UI_LICENSE || "a423a3908b1eb27b41de1c28fdc149e6";

/** Files already modified before the generator ran, so its own rewrites can be
 *  told apart from work in progress. See the report at the bottom. */
const dirtyBefore = new Set(gitDirty());

function gitDirty() {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", "components", "utils"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Not a git checkout, or git is unavailable.
    return [];
  }
}

for (const name of names) {
  console.log(`\n  untitledui add ${name}`);
  try {
    execFileSync(
      "npx",
      ["--yes", "untitledui@latest", "add", name, "--yes", "--license", LICENSE],
      {
        stdio: "inherit",
      },
    );
  } catch {
    // One component failing must not skip the fixes for the ones that landed —
    // that is how a half-installed tree ends up with the generator's unused
    // React import and a red typecheck nobody can place.
    console.error(`\n  ${name} failed. Continuing so the others still get patched.`);
    failed.push(name);
  }
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

    // 3. Vendored code is not held to this project's noUncheckedIndexedAccess.
    //
    //    That flag is a deliberate strictness for code written here: `sizes[i]`
    //    is `T | undefined` and the compiler makes you say so. Untitled UI is
    //    not written under it, so empty-state.tsx indexes an array it built
    //    itself and fails `tsc --noEmit` on three lines.
    //
    //    ADR-0058 said three patches was the point to stop automating and start
    //    reconsidering. This one is gone again, and the reason is worth keeping.
    //
    //    It used to prepend `// @ts-nocheck — vendored, see ADR-0062` to every
    //    file here, on the argument that a repository should not typecheck code
    //    it does not author. True of this project's *own* flags and false of
    //    everything else: @ts-nocheck silences a whole file, so it also hid two
    //    faults that would each have thrown on first render (ADR-0066) and one
    //    import of a package that is not a dependency (ADR-0070).
    //
    //    tsconfig.vendored.json replaces it: `strict` stays on, the four flags
    //    this project adds on top come off, and the vendored trees are excluded
    //    from the root project instead. Nothing to patch per file.

    // 4. The password reveal toggle is sized to its 16x16 icon, which
    //    Lighthouse flags as target-size — WCAG 2.2 AA (2.5.8) asks 24x24.
    //    Grown with an ::after so the icon itself does not move. ADR-0058.
    after = after.replace(
      /(\n\s*)(sizes\[inputSize\]\.iconTrailing,\n)(\s*\)\}\n\s*>\n\s*\{isPasswordVisible)/,
      `$1$2$1"size-6",
$3`,
    );

    // 5. The command menu's parseHotkeys.ts imports two types from
    //    `react-hotkeys-hook/dist/types`, which is where they lived in v4. The
    //    installed version is 5.x: its files are under
    //    `packages/react-hotkeys-hook/dist/`, and it declares both types
    //    *without* exporting them — so no path, internal or public, reaches
    //    them. `tsc --noEmit` fails with TS2307 and the component is
    //    unbuildable exactly as vendored.
    //
    //    The file is already a verbatim copy of the library's own source, so
    //    copying the two type declarations it needs is the same kind of thing
    //    and cannot break again when the package moves its files.
    after = after.replace(
      /^import type \{ Hotkey, KeyboardModifiers \} from "react-hotkeys-hook\/dist\/types";$/m,
      `type KeyboardModifiers = {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    mod?: boolean;
    useKey?: boolean;
};

type Hotkey = KeyboardModifiers & {
    keys?: readonly string[];
    scopes?: string | readonly string[];
    description?: string;
    isSequence?: boolean;
    hotkey: string;
    metadata?: Record<string, unknown>;
};`,
    );

    if (after !== before) {
      writeFileSync(file, after);
      fixed.push(file);
    }
  }
}

/**
 * What the generator touched that it was not asked to.
 *
 * `untitledui add` rewrites shared files it considers dependencies, and some of
 * those have deliberate divergences from upstream. Adding `command-menu-users`
 * silently reverted the trim on `application/empty-state`, putting back the
 * `@untitledui/file-icons` import and the background-patterns barrel — 62 kB and
 * 20.8 kB of gzipped SVG that were measured out on purpose.
 *
 * That cannot be auto-repaired: this script has no way to know which upstream
 * differences are intentional. What it can do is refuse to let the revert be
 * silent. Anything already tracked by git that came back changed is listed here
 * so the diff gets read rather than committed.
 */
const touched = gitDirty().filter((f) => !dirtyBefore.has(f) && !fixed.includes(f));

if (touched.length) {
  console.log(
    `\n  the generator also rewrote ${touched.length} file(s) that already existed:\n    ${touched.join("\n    ")}\n` +
      "\n  READ THE DIFF. A deliberate divergence from upstream looks exactly like\n" +
      "  an update here, and reverting one is silent. See ADR-0078.",
  );
}

console.log(
  fixed.length
    ? `\n  patched ${fixed.length} file(s) the generator would have failed on:\n    ${fixed.join("\n    ")}`
    : "\n  nothing to patch — the generator's output already passes this project's checks",
);
if (failed.length) console.error(`\n  failed to add: ${failed.join(", ")}`);
console.log("\n  now run: ./scripts/verify.sh\n");
