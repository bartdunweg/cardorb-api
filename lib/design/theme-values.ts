/**
 * TEMPORARY — the six values that cannot be read from CSS.
 *
 * Four consumers here cannot read a stylesheet, so they cannot read
 * styles/theme.css either:
 *
 *   - app/manifest.ts        — JSON (theme_color, background_color)
 *   - app/layout.tsx         — viewport.themeColor, a JS object
 *   - app/opengraph-image.tsx and app/user/[username]/opengraph-image.tsx
 *                            — Satori draws these without a browser
 *
 * Two more read the scale rather than a colour: utils/cx.ts teaches
 * tailwind-merge which radius names exist, and app/brand/page.tsx renders the
 * swatch tables.
 *
 * TODO(phase-3): delete this file. styles/theme.css becomes the single source,
 * and a small script extracts these values out of it into
 * lib/design/theme-values.generated.ts. One direction, one source, and the rule
 * "no hex outside theme.css" survives — which it cannot while this file exists.
 *
 * Until then these are literals lifted verbatim from the deleted
 * lib/design/tokens.ts, so nothing silently changes colour during the rebuild.
 * The measured contrast arguments that stood beside them are gone with that
 * file; ADR-0092 and its neighbours in docs/decisions/ still hold the reasoning.
 */
export type ColourPair = { light: string; dark: string };

export const colour = {
  label: { light: "#111111", dark: "#ffffff" },
  labelSecondary: { light: "#666666", dark: "#959595" },
  labelTertiary: { light: "#737373", dark: "#8c8c8c" },
  bgGrouped: { light: "#fafafa", dark: "#171717" },
  bgSurface: { light: "#ffffff", dark: "#0a0a0a" },
  glassSolid: { light: "rgba(255, 255, 255, 0.9)", dark: "rgb(37, 37, 39)" },
} satisfies Record<string, ColourPair>;

/** Names only — tailwind-merge needs the scale, not the values. */
export const radiusNames = [
  "orb-xs",
  "orb-sm",
  "orb-md",
  "orb-lg",
  "btn",
  "pill",
  "control",
  "control-inner",
] as const;
