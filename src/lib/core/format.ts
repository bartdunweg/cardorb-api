// Pure formatting helpers. Kept out of lib/blog.ts because that module reads
// the filesystem, which would drag a client component onto the server.

import { LOCALE } from "./config";

/**
 * Euros, the way a price is written on the card routes: no decimals over a
 * hundred, because at that size the cents are noise on a number that is an
 * estimate anyway.
 *
 * One definition rather than three. CardsView, CardsDashboard and CardDetail
 * each carried this function character for character, which is how the same
 * price ends up rounded two ways on two screens.
 */
export const euro = (n: number) =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);

/** Euros with nothing after the point, for the ends of an estimated range. */
export const euroWhole = (n: number) =>
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Format an ISO date (YYYY-MM-DD) as e.g. "Mar 4, 2026".
 *
 * Feeds the RSS items, OG images and article pages, so a malformed input used
 * to surface as a silent "Jan 0, 0" or "Jan NaN, NaN" in published output.
 * Returns the raw string unchanged instead, which is at least self-evidently
 * wrong when it shows up.
 */
export function formatDate(iso: string): string {
  const parts = iso.split("-").map(Number);
  const [y, m, d] = parts;
  const valid =
    parts.length === 3 &&
    parts.every(Number.isInteger) &&
    y !== undefined &&
    m !== undefined &&
    d !== undefined &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= 31;
  if (!valid) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}
