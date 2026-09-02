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
 *
 * The Supabase project's own storage host joins them for the same reason,
 * once there is a picture that comes from it: avatars
 * (app/api/v1/profile/avatar/route.ts) are public objects in Storage, served
 * directly from `<project>.supabase.co/storage/v1/object/public/...`. Read
 * from NEXT_PUBLIC_SUPABASE_URL rather than hard-coded, since the project
 * differs between environments and next.config.ts runs at build/start where
 * that variable is already available (lib/storage/supabase.ts reads the same
 * one). Falls out of the policy entirely, same as every other source here,
 * when the variable is unset — a CI build with no Supabase project configured
 * has nothing to allow.
 */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
/**
 * Every host a card picture may come from, and nothing else.
 *
 * `images.scrydex.com` is pokemontcg.io's newer CDN, not a third party we chose:
 * its API hands out image URLs on both hosts and has been moving sets across one
 * at a time. Measured on 2026-08-22 — of 348 set logo and symbol URLs the API
 * returned, 340 were on `images.pokemontcg.io` and 8 on `images.scrydex.com`,
 * all of them recent sets. Those 8 were simply blocked: /collection/browse threw
 * 68 CSP errors and drew blank tiles, in production, for everyone.
 *
 * Adding it does widen what the page may load. That is the honest cost, and it
 * is the same cost already accepted for the two hosts beside it: an allow-list
 * of picture sources this app asks for by name, none of which may run a script.
 * The alternative is a browse page that loses a set every few weeks.
 */
const IMG_SRC =
  `img-src 'self' data: blob: https://assets.tcgdex.net https://images.pokemontcg.io ` +
  `https://images.scrydex.com ` +
  `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com${supabaseHost ? ` ${supabaseHost}` : ""}`;

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
  // va.vercel-scripts.com is the debug build of the analytics beacon, which is
  // the only thing @vercel/analytics loads off-origin and only outside
  // production. Deployed, the script and its beacon are both served from
  // /_vercel/insights on this origin and 'self' is all either one needs.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
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

/**
 * Settings became one page, so its four sub-routes stopped existing.
 *
 * They are redirected rather than left to 404 because they were addresses
 * people and machines already hold: a bookmark, and — the one that matters —
 * the `next=` in a confirmation email sent before this change, which lands
 * somebody on /settings/account after they confirm a new address.
 *
 * /settings/password is deliberately absent from this list: it is a real
 * route still, outside the app shell, reached from password recovery.
 */
const SETTINGS_SECTIONS = ["profile", "account", "import", "appearance"];

/**
 * The API's own hostname. On this host `/v1/…` is the API, `/openapi.yaml` is
 * the contract and `/` is its documentation; everything else is not served.
 *
 * Same Vercel project, same code, one extra domain attached: a second
 * deployment would be a second thing to keep in step with the first, and the
 * routes already exist under /api/v1 on cardorb.com. A host-conditional rewrite
 * is a view of the same app, and it stays a view whether or not the domain is
 * attached yet — a request for `api.cardorb.com` that never arrives matches
 * nothing and changes nothing.
 *
 * The web tool keeps calling `/api/v1` on its own origin, on purpose. Its
 * session is a cookie scoped to cardorb.com, and a browser would not send it
 * across to api.cardorb.com; the iOS app sends a bearer token, which crosses
 * hosts without a second thought. So the browser stays home and the app moves.
 *
 * Cloudflare stays DNS-only for this host too (R-PLAT-001): the rewrite
 * reads the `host` header, which the proxy would rewrite.
 */
export const API_HOST = "api.cardorb.com";

/** Rewrites that only fire on the API host, in the order Next tries them. */
export const API_HOST_REWRITES = [
  { source: "/v1/:path*", destination: "/api/v1/:path*" },
  { source: "/", destination: "/docs/api" },
].map((rewrite) => ({ ...rewrite, has: [{ type: "host" as const, value: API_HOST }] }));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    // beforeFiles, because `/` exists on the filesystem (the landing page) and
    // an afterFiles rewrite would never get the chance to send the API host's
    // root to the documentation instead.
    return { beforeFiles: API_HOST_REWRITES, afterFiles: [], fallback: [] };
  },
  async redirects() {
    return [
      ...SETTINGS_SECTIONS.map((section) => ({
        source: `/settings/${section}`,
        destination: "/settings",
        permanent: true,
      })),
      {
        // /app is the address somebody types looking for the app page, and
        // there is only one of those to send them to. Temporary, not
        // permanent, and that is the whole point of the entry: when the
        // Android page lands, /app should become the index of both, and a 308
        // cached in every browser that ever followed it would make that
        // change arrive weeks late for the people who had already been here.
        source: "/app",
        destination: "/app/ios",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
