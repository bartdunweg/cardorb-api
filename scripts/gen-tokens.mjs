/**
 * lib/design/tokens.ts → app/styles/tokens.generated.css
 *
 *   node scripts/gen-tokens.mjs           # write
 *   node scripts/gen-tokens.mjs --check   # fail if the file on disk disagrees
 *
 * The direction is the point. CSS cannot be read by the three consumers that
 * are not CSS — manifest.ts is JSON, layout.tsx's themeColor is a JS object,
 * and both OG images are React that Satori draws without a browser — so a
 * stylesheet cannot be the source of truth without those three keeping copies.
 * They did keep copies, and one of the copies was wrong: the OG images used
 * #767676, the exact value tokens.css rejects in a paragraph for measuring
 * under AA. Every shared link carried a contrast bug the app had already fixed.
 *
 * So TypeScript holds the values and this writes the stylesheet. `npm run
 * check` runs it with --check, which means editing the generated CSS by hand
 * fails CI with the filename in the message. That is the whole mechanism: not
 * "please keep these in step", but "these cannot drift".
 *
 * That was the first argument. The second is the one that moved everything
 * else here, and it is about `@theme` rather than about who can read CSS.
 *
 * Only a token inside `@theme` becomes a Tailwind utility. Colour and radius
 * were, so a component writes `text-label` and `rounded-btn`. Type, weight,
 * line-height, easing, duration, blur and stacking order were not, so the only
 * way to reach any of them from a className was the arbitrary-value escape
 * hatch: `[font-size:var(--fs-small)]`. There were 721 of those in `.tsx`
 * before this. The design system existed and stopped at the door of the
 * language every component is written in.
 *
 * So this now writes four things:
 *
 *   1. `@theme` — the scales Tailwind has a namespace for, which is what turns
 *      them into utilities: `text-small`, `font-title`, `leading-tight`,
 *      `ease-smooth`, `blur-glass`, `font-main`.
 *   2. `:root` — the same values again as ordinary custom properties, because
 *      Tailwind v4 tree-shakes theme variables it cannot see a utility for and
 *      most of the CSS in this project is still hand-written and reads them by
 *      name.
 *   3. `@utility` blocks for the two kinds that cannot live in `@theme`: the
 *      shadows, which are a different *shape* per theme, and the layout
 *      constants, which are redefined at breakpoints. Their values stay in
 *      tokens.css next to the block that answers for them; only the class is
 *      generated.
 *   4. An alias block, `--fs-small: var(--text-small)` and its like, so the
 *      several hundred existing call sites keep resolving while they are
 *      migrated one portion at a time. There is one source for each value; the
 *      old name is a pointer at it, not a copy.
 *
 * What it still does not generate: the spacing scale, which is Tailwind's
 * default scale step for step (`p-4` already is `--space-4`), and everything
 * theme- or breakpoint-shaped that is not in group 3 — the glass surfaces and
 * borders, whose argument is prose that belongs beside the value.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "app/styles/tailwind.generated.css";

// The token module is TypeScript, and this is plain node. Rather than add a
// build step for one import, ask tsc's own transpiler through the copy already
// in node_modules — the same trick scripts/price-basis.mjs avoids by being .mjs
// in the first place, which was not an option here because the values have to
// be typed where the app reads them.
const ts = await import("typescript");
const source = readFileSync("lib/design/tokens.ts", "utf8");
const js = ts.default.transpileModule(source, {
  compilerOptions: { module: ts.default.ModuleKind.ESNext, target: ts.default.ScriptTarget.ES2022 },
}).outputText;
const { colour, radius, text, leading, fontWeight, font, ease, duration, blur, zIndex, utilities } =
  await import(`data:text/javascript,${encodeURIComponent(js)}`);

/**
 * Untitled UI's theme, spliced in rather than imported.
 *
 * It has to be inlined for the same reason this file exists at all: an @theme
 * block reached through a nested @import never reaches Tailwind, because Next
 * resolves the import itself and the block arrives as ordinary CSS. So the
 * vendored copy is read here and its two halves are pasted into the output.
 *
 * lib/design/untitled-theme.css is upstream's file, unmodified, so it can be
 * diffed against a later version. Everything this project changes about it is
 * done here, in code, where the reason can be written down.
 */
const UUI = "lib/design/untitled-theme.css";
const uui = readFileSync(UUI, "utf8");

/** The body of a `selector {` block, given the line it starts on. Brace-counted
    rather than regexed, because @theme contains @keyframes with their own. */
function blockBody(text, openMatch) {
  const start = text.indexOf(openMatch);
  if (start === -1) throw new Error(`${UUI}: no ${openMatch.trim()} — has upstream restructured?`);
  let i = start + openMatch.length;
  let depth = 1;
  const from = i;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
  }
  if (depth !== 0) throw new Error(`${UUI}: unbalanced braces after ${openMatch.trim()}`);
  return text.slice(from, i - 1).replace(/\s+$/, "");
}

const uuiTheme = blockBody(uui, "@theme {");
const uuiDark = blockBody(uui, ".dark-mode {");

/** camelCase → kebab-case, so `labelSecondary` is `--label-secondary`. */
const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const lines = [];
for (const [name, value] of Object.entries(colour)) {
  if (!value || typeof value !== "object" || !("light" in value)) continue;
  const prop = `--color-${kebab(name)}`;
  lines.push(
    value.light === value.dark
      ? `  ${prop}: ${value.light};`
      : `  ${prop}: light-dark(${value.light}, ${value.dark});`,
  );
}

/**
 * The prefix each scale takes is Tailwind's, not ours, and that is the whole
 * mechanism: `--text-*` is what makes `text-small` exist, `--font-weight-*` is
 * what makes `font-title` exist. A name off the namespace generates nothing and
 * fails silently, which is why these are written down once here rather than
 * spelled out at each call.
 *
 * `--dur-*` and `--z-*` have no namespace — Tailwind's duration utilities take
 * a number and its z-index utilities take an integer — so those two are emitted
 * as plain variables here and given `@utility` blocks below.
 */
const SCALES = [
  ["--radius", radius],
  ["--text", text],
  ["--leading", leading],
  ["--font-weight", fontWeight],
  ["--font", font],
  ["--ease", ease],
  ["--blur", blur],
  ["--dur", duration],
  ["--z", zIndex],
];

for (const [prefix, scale] of SCALES) {
  for (const [name, value] of Object.entries(scale)) {
    lines.push(`  ${prefix}-${kebab(name)}: ${value};`);
  }
}

/**
 * The old names, kept alive as pointers.
 *
 * Three scales had names off Tailwind's namespaces — `--fs-*`, `--fw-*`,
 * `--lh-*` — and several hundred call sites in `.tsx` and in the hand-written
 * sheets still say them. Renaming those in one commit is the big-bang that has
 * already been tried and reverted once in this repo (see controlClasses.ts).
 *
 * So an alias is a `var()` at the new name, never a second copy of the value.
 * The two cannot drift, and an alias block that has emptied out is how this
 * migration reports that it is finished.
 */
const ALIASES = [
  ["--fs", "--text", text],
  ["--fw", "--font-weight", fontWeight],
  ["--lh", "--leading", leading],
];

const aliasLines = ALIASES.flatMap(([old, current, scale]) =>
  Object.keys(scale).map((name) => `  ${old}-${kebab(name)}: var(${current}-${kebab(name)});`),
);

/**
 * The classes whose *value* stays in tokens.css.
 *
 * A shadow is three layers in light and two in dark, and a page gutter is 32px,
 * 24px or 16px depending on the viewport. Neither is expressible in `@theme`,
 * and both have to keep their declaration beside the `[data-theme]` or `@media`
 * block that answers for them. Reading the variable rather than inlining a
 * value is what keeps that true.
 */
const utilityBlocks = Object.entries(utilities)
  .map(
    ([name, { property, variable }]) => `@utility ${name} {\n  ${property}: var(${variable});\n}`,
  )
  .join("\n\n");

/**
 * `duration-fast` sets the longhand *and* Tailwind's own `--tw-duration`.
 *
 * Not belt and braces: `transition-*` in v4 emits
 * `transition-duration: var(--tw-duration, …)`, so a bare longhand here would
 * be at the mercy of which of the two declarations Tailwind happens to emit
 * last — the same "two utilities on one element, order decided by the
 * compiler" hazard that stopped `.btn--primary` moving (see controlClasses.ts).
 * Writing both makes the class correct whichever way that falls.
 */
const motionBlocks = [
  ...Object.keys(duration).map(
    (name) =>
      `@utility duration-${kebab(name)} {\n  --tw-duration: var(--dur-${kebab(name)});\n` +
      `  transition-duration: var(--dur-${kebab(name)});\n}`,
  ),
  ...Object.keys(zIndex).map(
    (name) => `@utility z-${kebab(name)} {\n  z-index: var(--z-${kebab(name)});\n}`,
  ),
].join("\n\n");

const css = `/* Generated by scripts/gen-tokens.mjs from lib/design/tokens.ts.
   Do not edit: npm run check regenerates this and fails on a diff.

   This is Tailwind's entry point as well as the token sheet, and the two are
   one file for a reason found the hard way: an @theme block reached through a
   nested @import never gets to Tailwind at all. Next's CSS pipeline resolves
   the import itself, so the block arrives as ordinary CSS, the theme stays
   empty, and every colour utility silently does not exist. One file, no nesting.

   Every colour is one declaration with two answers. light-dark() reads
   color-scheme, which :root sets to 'light dark' — so a visitor who has chosen
   nothing gets their machine's preference before any JavaScript runs, and a
   pair updated on one side only is not expressible. Every other scale here has
   no theme to answer to and is a single value each.

   The reasoning for each value lives in lib/design/tokens.ts, beside the
   number, where the tests that assert it can read it too. */

@import "tailwindcss";

/* Plain @theme rather than @theme inline: 'inline' pastes the value into the
   utility, which would freeze light-dark() to whichever half the compiler saw.
   This emits the variable and has utilities reference it, so both halves reach
   the browser — and the hand-written CSS, which is still the larger half of
   this project, can read the same variables. */
@theme {
${uuiTheme}

  /* ── Card Orb, from lib/design/tokens.ts ──────────────────────────────── */

${lines.join("\n")}
}

/* 'dark:' follows the attribute this app already sets, not the OS.
   Tailwind's default is prefers-color-scheme, which would disagree with the
   page the moment somebody picks a theme: the stylesheet dark, every dark:
   utility still light. :where() keeps it at zero specificity so it stacks like
   an unprefixed utility.

   Most colours never need it — light-dark() answers both sides in one
   declaration. This is for the handful that are a different *shape* in dark
   rather than a different value, like the shadows with three layers in light
   and two in dark. */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* The same values again, as ordinary custom properties.
   Not a slip and not a fallback: Tailwind v4 tree-shakes theme variables it
   cannot see a utility for, which is right for a project written entirely in
   utilities and wrong for this one. Most of the CSS here is hand-written and
   reads these by name, so they have to exist whether or not anything says
   bg-bg-surface. Both blocks are written from one array in the generator, so
   there is nothing here that can disagree with the block above. */
:root {
${lines.join("\n")}

  /* ── The old names, as pointers ──
     Aliases, never copies: each is a var() at the canonical name above, so the
     two cannot disagree. They exist so the call sites still written as
     [font-size:var(--fs-small)] keep resolving while they are migrated to
     text-small one portion at a time. When this block is empty the migration
     is over, which is the only progress report it needs. */
${aliasLines.join("\n")}
}

/* ── Untitled UI's dark mode, bridged to this app's ───────────────────────────

   Upstream writes these under a '.dark-mode' class. This app has no such class:
   it sets data-theme on <html>, and only when somebody has actually chosen. So
   the selector is rewritten here, and it is rewritten *twice*, which is the
   whole point of this block.

   Card Orb's own colours are light-dark(), and light-dark() reads color-scheme,
   which :root sets to 'light dark'. A visitor who has never touched the theme
   switch therefore gets their machine's preference with no attribute set and no
   JavaScript run. Untitled UI's colours are not light-dark() — they are two flat
   sets of values — so that same visitor, on a dark machine, would have got Card
   Orb's dark surfaces underneath Untitled UI's light text. Dark page, dark card,
   black type on it.

   Hence the second rule: prefers-color-scheme for whoever has not chosen, and
   :not([data-theme="light"]) so that choosing light on a dark machine still
   wins. The first rule covers whoever has chosen dark. Between them the two
   agree with light-dark() in all four cases.

   Kept inside @layer base, where upstream put it. Unlayered CSS beats layered
   CSS, so the ':root' block above always wins over anything in here — which is
   correct, because that block is Card Orb's own names and this one is Untitled
   UI's, and where they ever collide it should be ours that stands. ADR-0012 is
   this project's cautionary tale about exactly this cascade, and is worth
   reading before moving either block. */
@layer base {
  [data-theme="dark"] {
${uuiDark}
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
${uuiDark}
    }
  }
}
/* ── Classes over values that cannot live in @theme ──
   A shadow is three layers in light and two in dark; a page gutter is 32, 24
   or 16 depending on the viewport. Both keep their declaration in tokens.css
   beside the [data-theme] or @media block that answers for them, and read it
   here rather than inlining it, so the class stays correct when the block
   changes. */

${utilityBlocks}

${motionBlocks}
`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== css) {
    console.error(
      `\n  ${OUT} does not match lib/design/tokens.ts.\n` + `  Run: node scripts/gen-tokens.mjs\n`,
    );
    process.exit(1);
  }
  console.log(`  ${OUT} is up to date (${lines.length} tokens)`);
} else {
  writeFileSync(OUT, css);
  console.log(`  wrote ${OUT} — ${lines.length} tokens`);
  try {
    execFileSync("npx", ["prettier", "--write", OUT], { stdio: "ignore" });
  } catch {
    // Prettier is a nicety here; a generated file that is not formatted is
    // still correct, and failing the generator over it would be worse.
  }
}
