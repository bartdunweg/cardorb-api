/**
 * styles/theme.css → lib/design/theme-values.generated.ts
 *
 *   node scripts/extract-theme-values.mjs           # write
 *   node scripts/extract-theme-values.mjs --check   # fail if the file disagrees
 *
 * ── Why this exists, and why it runs in this direction ─────────────────────
 *
 * The rule is that no design value is written down twice, and that the one
 * place it lives is styles/theme.css. Four consumers make that rule impossible
 * on their own, because none of them can read a stylesheet:
 *
 *   - app/manifest.ts                        JSON
 *   - app/layout.tsx (viewport.themeColor)   a JS object
 *   - app/opengraph-image.tsx                Satori, drawn without a browser
 *   - app/user/[username]/opengraph-image.tsx
 *
 * They used to be served by lib/design/tokens.ts, which held the values in
 * TypeScript and generated the CSS from them. That direction works, but it puts
 * hex in a .ts file, which is the thing this project has now decided against.
 * So the arrow is reversed: CSS is the source, and this writes the TypeScript.
 *
 * It is not a copy. It *resolves* — `--color-orb-page` is a `var()` at an
 * Untitled UI semantic token, which is a `light-dark()` of two Tailwind
 * primitives — so there is still exactly one place each value is decided, and
 * nothing here can drift from it. The previous arrangement did drift: ADR-0089
 * found Card Orb's hand-written pairs describing a page colour the app had
 * stopped painting.
 *
 * `npm run check` runs this with --check, so editing the generated file by hand
 * fails CI with the filename in the message.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const THEME = "styles/theme.css";
const TAILWIND = "node_modules/tailwindcss/theme.css";
const OUT = "lib/design/theme-values.generated.ts";

/** Every `--name: value;` in a sheet. Later wins, as the cascade would. */
function declarations(path) {
  const map = new Map();
  for (const m of readFileSync(path, "utf8").matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]*);/gs)) {
    map.set(m[1], m[2].split(/\s+/).filter(Boolean).join(" "));
  }
  return map;
}

const vars = new Map([...declarations(TAILWIND), ...declarations(THEME)]);

/**
 * Resolve one token down to a literal colour, for one theme.
 *
 * Handles the two shapes this project's tokens are written in: `var(--x)` and
 * `light-dark(a, b)`. Anything else is returned as-is and the caller decides
 * whether it is a colour it can use.
 */
function resolve(name, mode, seen = new Set()) {
  if (seen.has(name)) throw new Error(`${THEME}: ${name} refers to itself`);
  seen.add(name);

  let value = vars.get(name);
  if (value === undefined)
    throw new Error(`${THEME}: ${name} is not declared in ${THEME} or ${TAILWIND}`);

  const ld = value.match(/^light-dark\(\s*(.*?)\s*,\s*(.*?)\s*\)$/s);
  if (ld) value = mode === "dark" ? ld[2] : ld[1];

  const ref = value.match(/^var\(\s*(--[a-z0-9_-]+)\s*\)$/);
  if (ref) return resolve(ref[1], mode, seen);

  return value;
}

/**
 * oklch() → #rrggbb.
 *
 * Needed because Tailwind's own palette is oklch and a web manifest, a <meta>
 * tag and Satori all want a plain colour. Full conversion rather than the
 * grey-only shortcut the values happen to allow today: every neutral in use is
 * `oklch(L% 0 none)`, and a shortcut would break silently the first time
 * somebody points a token at a colour with chroma.
 */
function oklchToHex(l, c, h) {
  const hr = (h * Math.PI) / 180;
  const [A, B] = [c * Math.cos(hr), c * Math.sin(hr)];

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const linear = [
    +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];

  const channel = (x) => {
    const g = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, g)) * 255)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${linear.map(channel).join("")}`;
}

/** Whatever CSS colour syntax came out of resolve(), as #rrggbb. */
function toHex(value, name) {
  const oklch = value.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+(none|[\d.]+)\s*\)$/i);
  if (oklch) {
    const l = Number(oklch[1]) > 1 ? Number(oklch[1]) / 100 : Number(oklch[1]);
    const h = oklch[3] === "none" ? 0 : Number(oklch[3]);
    return oklchToHex(l, Number(oklch[2]), h);
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    return `#${rgb
      .slice(1, 4)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    return `#${h.length === 3 ? [...h].map((d) => d + d).join("") : h}`.toLowerCase();
  }

  throw new Error(
    `${OUT}: ${name} resolves to "${value}", which is not a colour this script can convert`,
  );
}

/**
 * The tokens the four non-CSS consumers ask for, under the names they already
 * use. The keys are this file's contract; the values are theme.css's business.
 */
const WANTED = {
  label: "--color-orb-label",
  labelSecondary: "--color-orb-label-secondary",
  labelTertiary: "--color-orb-label-tertiary",
  bgGrouped: "--color-orb-page",
  bgSurface: "--color-orb-surface",
};

const pairs = Object.entries(WANTED).map(([key, token]) => {
  const light = toHex(resolve(token, "light"), token);
  const dark = toHex(resolve(token, "dark"), token);
  return `  ${key}: { light: "${light}", dark: "${dark}" },`;
});

/**
 * tailwind-merge does not read the stylesheet: it knows Tailwind's own scale by
 * heart and treats an unknown class as belonging to no group, so it never
 * replaces another class. `cx("rounded-lg", "rounded-orb-sm")` returned both
 * until this list existed. Read from theme.css rather than typed out, because a
 * hand-written list stops covering the scale the first time somebody adds to it.
 *
 * Only the names theme.css *adds*. Tailwind's own --radius-* are already in
 * tailwind-merge's built-in scale, and Untitled UI re-declares several of them
 * verbatim — listing those here would make tailwind-merge treat its own scale
 * as a stranger, which is the bug this list exists to fix, one rung up.
 */
/* tailwind-merge's built-in radius vocabulary. Written out rather than read from
   node_modules, because tailwind-merge carries this list itself and it is not
   the same thing as which --radius-* Tailwind happens to declare: `full` and
   `none` are utilities it knows without a variable behind them. */
const BUILT_IN_RADII = new Set(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"]);

const radiusNames = [...declarations(THEME).keys()]
  .filter((n) => n.startsWith("--radius-"))
  .map((n) => n.replace("--radius-", ""))
  .filter((n) => n && !BUILT_IN_RADII.has(n))
  .sort();

if (!radiusNames.length)
  throw new Error(
    `${THEME}: no Card Orb --radius-* tokens found — has the theme been restructured?`,
  );

const ts = `// Generated by scripts/extract-theme-values.mjs from ${THEME}.
// Do not edit: npm run check regenerates this and fails on a diff.
//
// These are the only design values that exist outside a stylesheet, and they
// exist because their four readers cannot read one — the web manifest is JSON,
// viewport.themeColor is a JS object, and both OG images are drawn by Satori
// without a browser. Every value here is resolved from ${THEME}, so the
// stylesheet stays the single source and this cannot drift from it.

export type ColourPair = { light: string; dark: string };

export const colour = {
${pairs.join("\n")}
} satisfies Record<string, ColourPair>;

/** Card Orb's radius scale, by name — tailwind-merge needs the names, not the values. */
export const radiusNames = [${radiusNames.map((n) => `"${n}"`).join(", ")}] as const;
`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== ts) {
    console.error(
      `\n  ${OUT} does not match ${THEME}.\n  Run: node scripts/extract-theme-values.mjs\n`,
    );
    process.exit(1);
  }
  console.log(`  ${OUT} is up to date (${pairs.length} colours, ${radiusNames.length} radii)`);
} else {
  writeFileSync(OUT, ts);
  console.log(`  wrote ${OUT} — ${pairs.length} colours, ${radiusNames.length} radii`);
}
