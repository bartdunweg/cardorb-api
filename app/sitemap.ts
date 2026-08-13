import type { MetadataRoute } from "next";
import { PUBLIC_USERNAME, SITE_URL } from "../lib/core/config";

/**
 * Two entries, and that is the honest size of this site.
 *
 * Everything else is either behind a password or a redirect to it. The landing
 * page is first because it is the address anyone would type, and the public
 * collection is the one page below it worth listing separately: the landing
 * links to it in two places, so a crawler would find it either way, but a
 * sitemap is what says "these two, and nothing else here".
 *
 * The second URL is built from PUBLIC_USERNAME rather than written out, so it
 * is the same source the route validates against and the two cannot disagree.
 * When accounts arrive, this becomes a query and nothing else here changes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      // It changes when the copy on it changes, which is to say rarely and by
      // hand. Claiming anything faster asks a crawler back for nothing.
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/user/${PUBLIC_USERNAME}`,
      // The collection revalidates hourly, but it changes when a pack is
      // opened, which is in bursts and then not for weeks. Weekly is what that
      // actually is, and claiming hourly here would be asking a crawler to come
      // back for nothing.
      changeFrequency: "weekly",
      // Below the landing page, which is now the front door. Priority is only
      // ever read relative to the other URLs in the same sitemap, so this says
      // "second of two" and nothing more.
      priority: 0.8,
    },
  ];
}
