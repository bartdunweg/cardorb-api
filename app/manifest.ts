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
    // No icons. There used to be two generated ones here, and the entries have
    // to go with them: a manifest that names /icon and /apple-icon after those
    // routes are deleted is a manifest pointing at two 404s, which is worse
    // than saying nothing — Android would fetch both and fail on install.
    //
    // The cost of the omission is real and worth writing down: without an icon
    // in here, Chrome on Android will not offer to install the app at all, so
    // `display: "standalone"` above only takes effect for whoever adds it to a
    // home screen by hand. iOS still will, and screenshots its own thumbnail.
    // Put an `icons` array back the day this gets a mark of its own.
  };
}
