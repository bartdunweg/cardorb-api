import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/core/config";

/**
 * What a crawler may look at, which is five pages.
 *
 * The layout already sends `noindex` on everything but /, /user/<name>,
 * /app/ios, /privacy and /terms, and that is the instruction that actually
 * counts — a robots rule asks a crawler
 * not to *fetch* a page, while noindex asks it not to *list* one, and a page
 * that is never fetched is a page whose noindex is never read. So both are here
 * and they say different things on purpose.
 *
 * /api is disallowed because there is nothing there for a reader and every
 * endpoint costs a database walk to answer. /cards is disallowed because the
 * proxy bounces an anonymous request to the login anyway, and a crawler
 * that follows it would index the login under the collection's URL. /login is
 * disallowed for the same reason from the other end: it is a password field,
 * and now that / is a page worth reading, a crawler that indexed the login
 * would be holding the wrong one of the two. /welcome is disallowed on that
 * same argument: it is the signed-in first-run flow, and anonymous is exactly
 * what a crawler is, so following it lands on the login again.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/cards", "/cards/", "/login", "/welcome"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
