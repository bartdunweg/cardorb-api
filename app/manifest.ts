import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "../lib/core/config";

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
 * through `viewport.themeColor`, and they are --color-left-bg in both themes.
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
    background_color: "#fafafa",
    theme_color: "#fafafa",
    // The generated ones, at the two sizes that exist. `any maskable` on the
    // large one lets Android crop it to whatever shape that launcher uses: the
    // mark is a centred letter on a full-bleed field, so there is nothing near
    // the edges for a crop to take.
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
