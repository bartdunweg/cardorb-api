/**
 * A card id as it arrives in a route's path, turned back into the id the catalogue files it under.
 *
 * TCGdex files one card with its number percent-encoded in the id itself: Unseen Forces Unown
 * Collection's question mark is `exu-%3F`. A client encodes that as `exu-%253F`, and the path reaches
 * the route decoded twice, as `exu-?`, so the sheet answered "No such card" and the chart had no line
 * while 31 months of that card's prices were stored (2026-09-14). No catalogue id holds a bare `?`
 * or `#`, which a URL cannot carry in a path, so one here is the encoded character restored.
 */
export const catalogueCardId = (param: string): string =>
  param.replace(/[?#]/g, (c) => encodeURIComponent(c));
