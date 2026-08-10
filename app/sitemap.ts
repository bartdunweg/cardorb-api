import type { MetadataRoute } from "next";
import { PUBLIC_USERNAME, SITE_URL } from "../lib/core/config";

/**
 * One entry, and that is the honest size of this site.
 *
 * Everything else is either behind a password or a redirect to it. The reason
 * this file exists for a single URL is that there is no other way in: the only
 * link to the public collection sits on the login page, which is `nofollow`, so
 * without a sitemap the one indexable page in this app has no path leading to
 * it at all.
 *
 * The list is built from PUBLIC_USERNAME rather than written out, so it is the
 * same source the route validates against and the two cannot disagree. When
 * accounts arrive, this becomes a query and nothing else here changes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/user/${PUBLIC_USERNAME}`,
      // The collection revalidates hourly, but it changes when a pack is
      // opened, which is in bursts and then not for weeks. Weekly is what that
      // actually is, and claiming hourly here would be asking a crawler to come
      // back for nothing.
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
