import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The scans come straight from the catalogues, and a client that renders them
  // needs the hosts named before a Content-Security-Policy will let them load.
  // There is no CSP here yet; when the web tool arrives, this is the list it
  // starts from, and the portfolio's own history is the warning: one missing
  // entry blocked every picture on a page whose whole subject was pictures.
  //
  //   assets.tcgdex.net, images.pokemontcg.io,
  //   limitlesstcg.nyc3.cdn.digitaloceanspaces.com
  reactStrictMode: true,
};

export default nextConfig;
