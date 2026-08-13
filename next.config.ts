import type { NextConfig } from "next";

// React's development build reconstructs callstacks with eval() and the dev
// server hot-reloads over a websocket. Both are dev-only concessions: the
// production policy below stays strict.
const isDev = process.env.NODE_ENV !== "production";

/**
 * The catalogue image hosts, which is what the policy was waiting on.
 *
 * Every card picture on the site comes from one of these three, and a host
 * that is not here renders as a broken image with a console error, silently
 * on the page and loudly in the devtools. The portfolio's own history is the
 * warning: one missing entry blocked every picture on a page whose whole
 * subject was pictures. Adding a fourth source means adding it here first.
 */
const IMG_SRC =
  "img-src 'self' data: blob: https://assets.tcgdex.net https://images.pokemontcg.io https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com";

/**
 * The whole policy, and every route gets the same one.
 *
 * Inline scripts are allowed because Next's own bootstrap is inline; a nonce
 * would need middleware and force dynamic rendering on every route. Inline
 * styles because motion writes transforms straight onto the element.
 *
 * No frame-src: the app embeds nothing, so default-src holding frames to
 * 'self' is the honest answer. connect-src is 'self' alone because every
 * fetch in the client is same-origin against /api/v1; the TCGdex and
 * Pokemon TCG APIs are only ever called from the server, through proxy.ts.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  IMG_SRC,
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
].join("; ");

/**
 * The five headers, on every route (`source: "/(.*)"`), applied once here
 * rather than per-route, for the same reason `robots: { index: false }` sits
 * on the root layout: a new screen should be protected by accident, not
 * exposed by accident.
 */
const SECURITY_HEADERS = [
  {
    // Vercel already sends this with no includeSubDomains and no preload.
    // Both are added here because the HSTS preload list — see README — checks
    // for exactly these two before it will accept a submission, and the
    // header will be verified live on both cardorb.com and the www redirect
    // before that submission happens.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on this site asks for a camera, a microphone or a location, so
  // nothing here is left to a default that assumes otherwise.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    // frame-ancestors carries what X-Frame-Options: DENY used to (this app in
    // someone else's iframe is always a clickjacking attempt, never a use
    // case), and it is now one directive in a real policy rather than the
    // whole of it.
    key: "Content-Security-Policy",
    value: CSP,
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
