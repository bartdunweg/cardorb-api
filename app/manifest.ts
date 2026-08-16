import type { MetadataRoute } from "next";
import { colour } from "../lib/design/tokens";
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
    /**
     * The mark, at the two sizes an installable web app is asked for.
     *
     * This array was empty for a long time and the comment that stood here said
     * why: there was no mark, and a manifest naming icons that 404 is worse
     * than one naming none — Android fetches both and fails the install. There
     * is a mark now (ADR-0047), so the cost that comment recorded is paid off:
     * Chrome on Android will offer to install this, and `display: "standalone"`
     * above stops being something only a hand-added home screen icon sees.
     *
     * Deliberately /brand/… and not /icon, which is the route app/icon.png
     * generates. Next fingerprints that URL in production, so hard-coding it
     * here would rebuild exactly the 404 the old comment warned about — with
     * the extra cruelty of working perfectly in dev. public/ is served
     * verbatim, so these two paths are the ones that cannot drift.
     *
     * The tiled cut rather than the transparent one: this icon is composited
     * onto a home screen whose colour nobody here chooses, and the orb is a
     * pale, glossy sphere that would vanish into a light wallpaper.
     */
    icons: [
      { src: "/brand/orb-tile-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/orb-tile-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
