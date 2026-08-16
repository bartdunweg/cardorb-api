import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/core/config";
import { publicUsernames } from "../lib/storage/collection";

/**
 * The landing page, and every collection that has asked to be found.
 *
 * Everything else is either behind a password or a redirect to it. The landing
 * page is first because it is the address anyone would type; the profiles below
 * it are the pages worth listing separately, and a sitemap is what says "these,
 * and nothing else here".
 *
 * This used to be exactly two entries, the second built from a PUBLIC_USERNAME
 * env var, with a note saying "when accounts arrive, this becomes a query".
 * It is the query. Only is_public profiles come back (enforced by the profiles
 * RLS policy as well as stated in the query), so a private collection is absent
 * here for the same reason it 404s on its own route — a sitemap that listed it
 * would be the one place its name leaked.
 *
 * Async, which makes this route dynamic rather than built once. That is the
 * point: the list changes when somebody flips their privacy switch, and a
 * sitemap generated at build time would keep answering with whoever was public
 * on deployment day.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const usernames = await publicUsernames();

  return [
    {
      url: `${SITE_URL}/`,
      // It changes when the copy on it changes, which is to say rarely and by
      // hand. Claiming anything faster asks a crawler back for nothing.
      changeFrequency: "monthly",
      priority: 1,
    },
    ...usernames.map((username) => ({
      url: `${SITE_URL}/user/${username}`,
      // A collection revalidates hourly, but it changes when a pack is opened,
      // which is in bursts and then not for weeks. Weekly is what that actually
      // is, and claiming hourly here would be asking a crawler to come back for
      // nothing.
      changeFrequency: "weekly" as const,
      // Below the landing page, which is the front door. Priority is only ever
      // read relative to the other URLs in the same sitemap, so this says
      // "below the front door" and nothing more.
      priority: 0.8,
    })),
  ];
}
