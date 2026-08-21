import { APP_NAME, APP_TAGLINE } from "./config";

/**
 * The site's default share picture, described once.
 *
 * `app/opengraph-image.tsx` draws it, but drawing it is not enough: Next replaces
 * a parent segment's `openGraph` block with a child's rather than merging the
 * two, so every nested route that declares `openGraph` at all loses the image
 * unless it names it again. That has now cost this repo three pages — /privacy
 * and /terms caught it, /app/ios shipped without any og:image at all.
 *
 * An object rather than a bare "/opengraph-image" string, because the string
 * form emits `og:image` alone. Scrapers that will not upgrade to a large card
 * without explicit dimensions then render a small one, and the `twitter:card`
 * value of "summary_large_image" beside it becomes a promise nothing keeps.
 *
 * `width`, `height` and `alt` are re-exported from here into the image route, so
 * the numbers in the meta tags and the numbers the image is actually drawn at
 * cannot drift apart.
 */
export const OG_IMAGE_ALT = `${APP_NAME} — ${APP_TAGLINE}`;

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

export const OG_IMAGE_TYPE = "image/png";

export const SITE_OG_IMAGE = {
  url: "/opengraph-image",
  width: OG_IMAGE_SIZE.width,
  height: OG_IMAGE_SIZE.height,
  type: OG_IMAGE_TYPE,
  alt: OG_IMAGE_ALT,
};
