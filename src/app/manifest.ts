import type { MetadataRoute } from "next";
import { colour } from "@/lib/design/theme-values.generated";
import { APP_NAME, APP_TAGLINE } from "@/lib/core/config";

/**
 * What this is when it is saved to a home screen.
 *
 * Worth having for one reason above the rest: this app is used on a phone,
 * standing in a shop, deciding whether a card is already in the binder. Saved
 * to the home screen with a manifest it opens without the browser chrome and
 * with the right name under the icon; without one it opens as a tab called
 * whatever the title said, inside Safari.
 *
 * start_url is / rather than /cards, because /cards is behind the proxy
 * and a session cookie that may have expired since the icon was tapped — the
 * redirect to /login would be the first thing the app ever showed. The landing
 * page decides where you go, and if you are signed in the sign-in button lands
 * you back in the collection in one tap.
 *
 * The two colours are the ones app/layout.tsx already gives the browser chrome
 * through `viewport.themeColor`, and they are --color-bg-grouped in both themes.
 * Written out rather than read from the token for the same reason they are
 * there: this is a JSON document, not CSS. If the token moves, three places
 * move.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    // What fits under an icon, which is about twelve characters. The name
    // already does, so these are the same string rather than a truncation
    // nobody would recognise.
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: colour.bgGrouped.light,
    theme_color: colour.bgGrouped.light,
    // The mark exists now, so these come back — the comment they replace said to
    // put them here the day it did. They point into /public rather than at the
    // /icon route, because a manifest is fetched by an installer outside the page
    // and a stable path is worth more here than Next's hashed one.
    //
    // Both are the app icon including its off-white tile, so they carry their own
    // background — a transparent icon on an Android launcher is a floating smear.
    // `maskable` is safe because the tile is full-bleed and the orb sits well
    // inside the safe zone, so a circular or squircle crop takes only tile.
    icons: [
      { src: "/brand/orb-tile-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/orb-tile-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/orb-tile-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
