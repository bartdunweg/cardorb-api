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
 * How long one request to a catalogue may take before it is given up.
 *
 * fetch() has no limit of its own: a server that accepts the connection and
 * never answers — assets.tcgdex.net did exactly that for a while on
 * 2026-09-02 — holds the function until Vercel's own limit, and with it every
 * collection build that needed the set. Eight seconds is longer than any of
 * these endpoints takes when it works and shorter than a reader waits. A
 * refusal this way is an error like any other, so json()'s retries and every
 * fail-soft catch treat it as one.
 */
export const CATALOGUE_TIMEOUT_MS = 8_000;
export const catalogueTimeout = () => AbortSignal.timeout(CATALOGUE_TIMEOUT_MS);

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

/**
 * The forms a card number can be written in, so a lookup can try all of them.
 *
 * The collection pads to three digits and TCGdex mostly agrees but not always,
 * so "88", "088" and whatever was actually typed are the same card. Deduped,
 * because for a number already three digits long all three forms collapse.
 *
 * Here rather than in cards.ts because both sides of the join need it: the
 * catalogue indexes every form of every localId, and a row is looked up by
 * every form of its own number. Two copies of this would be two rules.
 */
export const numberForms = (n: string) => [
  ...new Set([n, n.replace(/^0+/, ""), n.padStart(3, "0")]),
];

/**
 * Runs `work` over `items` a few at a time.
 *
 * Everything used to be fired at once, which for a collection this size meant
 * 48 simultaneous set fetches and then a burst of per-card fallbacks on top.
 * TCGdex started refusing them, and a refused set fetch is a whole section of
 * the page with no artwork, so the page was being punished for asking too fast
 * rather than for asking wrongly.
 */
export async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]!);
      }
    }),
  );
  return out;
}
