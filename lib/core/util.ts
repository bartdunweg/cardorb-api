/**
 * The four small things the collection walk borrows from elsewhere in the
 * portfolio it came from, gathered here so `cards.ts` can be copied without
 * dragging six hundred lines of cover-art resolution and an image manifest
 * behind it.
 *
 * Two of them are real (`DAY`, `norm`) and two are deliberately hollow
 * (`localise`, `measure`). See below.
 */

/** A day in seconds. Every artwork lookup is cached for one. */
export const DAY = 86400;

/**
 * Fold a string down to what it means rather than how it is typed: lowercase,
 * accents off, punctuation out. Copied from the portfolio's lib/normalise.ts,
 * where it has the same job for six other catalogues.
 */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/**
 * In the portfolio this swapped a remote image URL for a copy stored under
 * public/artwork, named for a hash of its contents, so the site served its own
 * pictures. That is a good trick and it does not survive the move: those paths
 * begin with `/artwork/` and resolve on one domain only, so an iOS client would
 * be handed a thousand broken images.
 *
 * So here it is the identity function and the scans come from TCGdex directly,
 * which works from anywhere. When binder wants its own artwork in-house, this
 * is the one place that has to change, and everything above it keeps calling it
 * the same way.
 */
export const localise = (url: string | null): string | null => url;

/**
 * Likewise: the portfolio knew how big its own copies were, because it had
 * measured them. Nothing has been measured here yet, and a made-up size is
 * worse than none: the grid reserves the wrong box and every card jumps when
 * the real picture lands.
 */
export const measure = (_image?: string | null): null => null;
