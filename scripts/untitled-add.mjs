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
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  renameSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";

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
 * From the environment, with no inline fallback any more.
 *
 * The fallback used to be the literal key, argued as "not a secret in any
 * useful sense" because the MCP server prints it to anyone who asks. That was
 * true of what it was then. It is now also the auth token for
 * pkg.untitledui.com in .npmrc, so the same string is what buys access to a
 * paid private registry — a credential, whatever the component CLI treats it
 * as. It reads NPM_TOKEN too, because that is the name it already has in the
 * environment and in Vercel. See ADR-0083.
 */
const LICENSE = process.env.UNTITLED_UI_LICENSE || process.env.NPM_TOKEN;

if (names.length && !LICENSE) {
  console.error(
    "\n  No licence. Set UNTITLED_UI_LICENSE or NPM_TOKEN.\n" +
      "  It is the same value as the token in .npmrc — take it from there,\n" +
      "  or from untitledui.com. See ADR-0083 for why it is no longer inline.",
  );
  process.exit(1);
}

/** Files already modified before the generator ran, so its own rewrites can be
 *  told apart from work in progress. See the report at the bottom. */
const dirtyBefore = new Set(gitDirty());

/** The vendored trees, since the src/ move. `src/hooks` is deliberately not a
 *  root for the *walk* — three hooks this project wrote live there beside the
 *  vendored ones, and the fixes below must not touch them. It is watched for
 *  new arrivals instead; see REPORT at the bottom. */
const ROOTS = ["src/components", "src/utils"];

function gitDirty() {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", ...ROOTS, "src/hooks"], {
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
      [
        "--yes",
        "untitledui@latest",
        "add",
        name,
        "--yes",
        "--license",
        LICENSE,
        // Without --path the CLI prompts, and a prompt in a scripted run hangs.
        // With it, the CLI *still* appends its own category folder underneath —
        // asking for `src/components` produces `src/src/components/base/base/…`,
        // because it also re-prefixes the project root. relocate() below is what
        // puts the files where this project keeps them.
        "--path",
        "src/components",
      ],
      { stdio: "inherit" },
    );
  } catch {
    // One component failing must not skip the fixes for the ones that landed —
    // that is how a half-installed tree ends up with the generator's unused
    // React import and a red typecheck nobody can place.
    console.error(`\n  ${name} failed. Continuing so the others still get patched.`);
    failed.push(name);
  }
}

/**
 * ── What the src/ move broke, and the generator does not know about ─────────
 *
 * The CLI assumes `@/` is the repository root and that components live at
 * `components/`. Both stopped being true when the tree moved under `src/`, and
 * every one of these failed *silently* in a way `tsc` reported somewhere else:
 *
 *   1. It writes to `src/src/components/base/base/<family>/`, because
 *      `--path src/components` is taken as a project root and its own category
 *      folders are appended underneath.
 *   2. It writes imports as `@/src/components/base/base/…`, which resolves to
 *      nothing now that `@/` is `./src/`. The symptom is not "module not found"
 *      on the import line — it is a props interface silently becoming an error
 *      type, and half a dozen "Property 'label' does not exist" errors fifty
 *      lines further down.
 *   3. It adds `@untitledui/icons` to package.json and imports from it, beside
 *      the `@untitledui-pro/icons` this project already has. ADR-0067 and
 *      ADR-0083 are both "one icon set"; an identical name is not an identical
 *      icon.
 *   4. **It overwrites `src/utils/cx.ts` with its own stock version**, which
 *      does not carry this project's radius scale. Nothing fails. `cx` simply
 *      stops treating `rounded-orb-*` as belonging to a group, so
 *      `cx("rounded-lg", "rounded-orb-sm")` returns both again — the exact bug
 *      that file's docstring exists to describe.
 *   5. It may write a new vendored hook into `src/hooks/`, where three
 *      first-party hooks live. That directory's lint exemption is per-file for
 *      that reason, so a new arrival has to be added to it by hand.
 *
 * 1-3 are repaired below. 4 is restored from git. 5 is reported, because only a
 * person can say which of the two kinds a new hook is.
 */

/** Move whatever the CLI dropped under src/src/ to where this project keeps it. */
function relocate() {
  const stray = "src/src";
  if (!existsSync(stray)) return [];
  const moved = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const from = join(dir, entry);
      if (statSync(from).isDirectory()) {
        walk(from);
        continue;
      }
      // src/src/components/base/base/select/combobox.tsx
      //   → src/components/base/select/combobox.tsx
      const parts = from.split("/");
      const i = parts.lastIndexOf("components");
      const tail = parts.slice(i + 1).filter((p, n) => !(n === 1 && p === parts[i + 1]));
      const to = join("src", "components", ...tail);
      mkdirSync(dirname(to), { recursive: true });
      if (!existsSync(to)) {
        renameSync(from, to);
        moved.push(to);
      } else {
        rmSync(from);
      }
    }
  };
  walk(stray);
  rmSync(stray, { recursive: true, force: true });
  return moved;
}

/** Every .ts/.tsx under the vendored trees. */
function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const relocated = relocate();

/**
 * The second icon package, removed again.
 *
 * The generator adds `@untitledui/icons` to package.json and imports from it.
 * This project has `@untitledui-pro/icons`, and ADR-0067 and ADR-0083 are both
 * "one icon set" — an identical name is not an identical icon. The per-file fix
 * below rewrites the imports; without this the dependency stays behind, which
 * is worse than either state on its own: nothing imports it, so nothing fails,
 * and the next person to read package.json finds two icon sets and no reason.
 */
let droppedDep = false;
{
  const pkg = readFileSync("package.json", "utf8");
  const without = pkg.replace(/^\s*"@untitledui\/icons": "[^"]*",\n/m, "");
  if (without !== pkg) {
    writeFileSync("package.json", without);
    droppedDep = true;
  }
}

/**
 * Files the generator overwrites that this project has customised.
 *
 * Restored from git rather than patched, because the generator does not modify
 * them — it replaces them wholesale with its stock version, so there is nothing
 * to find and repair. Only restored when the file was clean before the run;
 * blowing away somebody's uncommitted edit would be a worse failure than the
 * one this prevents.
 */
const OVERWRITTEN = ["src/utils/cx.ts", "src/utils/is-react-component.ts"];
const restored = [];
for (const file of OVERWRITTEN) {
  if (dirtyBefore.has(file)) continue;
  if (!gitDirty().includes(file)) continue;
  execFileSync("git", ["checkout", "--", file]);
  restored.push(file);
}

const fixed = [];

for (const dir of ROOTS) {
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

    // 1b. `@/src/components/base/base/…` → `@/components/…`. The generator
    //     writes the path it thinks it wrote to; `@/` is `./src/` here, so its
    //     version resolves to nothing. See the block above for why this shows
    //     up as a type error far from the import.
    //     Two rewrites, because the generator is not consistent about depth:
    //     it wrote `@/src/components/base/base/select/popover` in one file and
    //     `@/src/components/base/avatar/avatar` in another, in the same run.
    //     Dropping the `src/` and then collapsing a doubled category handles
    //     both without guessing how many segments to eat.
    after = after.replace(/@\/src\//g, "@/");
    after = after.replace(
      /@\/components\/(base|application|foundations|shared-assets)\/\1\//g,
      "@/components/$1/",
    );

    // 1c. One icon set (ADR-0067, ADR-0083). The generator imports from
    //     `@untitledui/icons`, the free package, which this project does not
    //     have — it has the PRO one, and every name checked so far exists in
    //     both. Adding the second package would make "which set is this icon
    //     from" a question again.
    after = after.replace(/from "@untitledui\/icons"/g, 'from "@untitledui-pro/icons/line"');

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

if (relocated.length) {
  console.log(
    `\n  moved ${relocated.length} file(s) out of src/src/, where the generator put them:\n    ${relocated.join("\n    ")}`,
  );
}

if (droppedDep) {
  console.log(
    "\n  removed @untitledui/icons from package.json — this project has the PRO\n" +
      "  set and only one is allowed (ADR-0067, ADR-0083). Run `npm install` to\n" +
      "  take it out of the lockfile too.",
  );
}

if (restored.length) {
  console.log(
    `\n  restored ${restored.length} file(s) the generator overwrote with its stock version:\n    ${restored.join("\n    ")}\n` +
      "\n  These carry this project's own configuration — cx.ts holds the radius\n" +
      "  scale tailwind-merge needs. Overwriting it fails nothing and quietly\n" +
      "  stops `rounded-orb-*` from being deduplicated.",
  );
}

/**
 * A new hook in src/hooks/ needs a decision only a person can make.
 *
 * That directory holds Untitled UI's hooks *and* three this project wrote, so
 * its lint and Prettier exemptions are per-file. A vendored arrival has to be
 * added to four lists; a first-party one must not be. Nothing here can tell
 * which it is.
 */
const untrackedHooks = (() => {
  try {
    return execFileSync("git", ["ls-files", "--others", "--exclude-standard", "src/hooks"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
})();
if (untrackedHooks.length) {
  console.log(
    `\n  new hook(s) in src/hooks/:\n    ${untrackedHooks.join("\n    ")}\n` +
      "\n  If vendored, add each to the per-file exemptions in eslint.config.mjs,\n" +
      "  .prettierignore, tsconfig.json and tsconfig.vendored.json. That directory\n" +
      "  is mixed on purpose and its exemption is per file, not per directory.",
  );
}

console.log(
  fixed.length
    ? `\n  patched ${fixed.length} file(s) the generator would have failed on:\n    ${fixed.join("\n    ")}`
    : "\n  nothing to patch — the generator's output already passes this project's checks",
);
if (failed.length) console.error(`\n  failed to add: ${failed.join(", ")}`);
console.log("\n  now run: ./scripts/verify.sh\n");
