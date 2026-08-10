import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/core/config";

/**
 * What a crawler may look at, which is one page.
 *
 * The layout already sends `noindex` on everything but /user/<name>, and that
 * is the instruction that actually counts — a robots rule asks a crawler not to
 * *fetch* a page, while noindex asks it not to *list* one, and a page that is
 * never fetched is a page whose noindex is never read. So both are here and
 * they say different things on purpose.
 *
 * /api is disallowed because there is nothing there for a reader and every
 * endpoint costs a Notion walk to answer. /cards is disallowed because the
 * middleware bounces an anonymous request to the login anyway, and a crawler
 * that follows it would index the login under the collection's URL.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/cards", "/cards/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
