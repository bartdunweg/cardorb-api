/**
 * Reading src/styles/theme.css, for the two things that have to agree with it.
 *
 * Shared rather than written twice. `scripts/extract-theme-values.mjs` resolves
 * a handful of tokens into TypeScript for the four consumers that cannot read a
 * stylesheet; `src/lib/design/contrast.test.ts` resolves every text and surface
 * token to check them against WCAG. If those two disagreed about what a token
 * is, the measurement would be of a colour the app does not paint — which is
 * exactly the failure the measurements exist to catch.
 *
 * A .mjs module rather than TypeScript so a plain `node scripts/…` run needs no
 * loader, and vitest imports it from a .ts test without ceremony.
 */

import { readFileSync } from "node:fs";

const THEME = "src/styles/theme.css";
const TAILWIND = "node_modules/tailwindcss/theme.css";
export { THEME, TAILWIND };

/** Every `--name: value;` in a sheet. Later wins, as the cascade would. */
export function declarations(path) {
  const map = new Map();
  for (const m of readFileSync(path, "utf8").matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]*);/gs)) {
    map.set(m[1], m[2].split(/\s+/).filter(Boolean).join(" "));
  }
  return map;
}

export const vars = new Map([...declarations(TAILWIND), ...declarations(THEME)]);

/**
 * Resolve one token down to a literal colour, for one theme.
 *
 * Handles the two shapes this project's tokens are written in: `var(--x)` and
 * `light-dark(a, b)`. Anything else is returned as-is and the caller decides
 * whether it is a colour it can use.
 */
export function resolve(name, mode, seen = new Set()) {
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
export function toHex(value, name) {
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
