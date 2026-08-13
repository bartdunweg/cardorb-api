import type { NextConfig } from "next";

/**
 * The five headers that do not need to wait on anything.
 *
 * A full Content-Security-Policy is still deferred — see the comment below —
 * because it needs the catalogue image hosts named before it will let a scan
 * load, and the portfolio's own history is the warning: one missing entry
 * blocked every picture on a page whose whole subject was pictures. But
 * `frame-ancestors` and the other four here have no such dependency, and there
 * is no reason a card's worth of clickjacking protection should wait on that.
 *
 * On every route (`source: "/(.*)"`), applied once here rather than per-route,
 * for the same reason `robots: { index: false }` sits on the root layout: a
 * new screen should be protected by accident, not exposed by accident.
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
    // Deliberately two directives and not a real policy. frame-ancestors is
    // the modern replacement for X-Frame-Options: DENY (this app in someone
    // else's iframe is always a clickjacking attempt, never a use case), and
    // object-src closes off plugins. img-src and connect-src stay out until
    // the catalogue hosts are settled:
    //
    //   assets.tcgdex.net, images.pokemontcg.io,
    //   limitlesstcg.nyc3.cdn.digitaloceanspaces.com
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
