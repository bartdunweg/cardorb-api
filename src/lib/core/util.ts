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

/**
 * A printed card number the way two catalogues can be compared on it: leading zeros off
 * ("014" is 14), letters upper-case ("XY150a" is XY150A). pokemontcg.io prefixes a promo's
 * number with its set (SWSH282) where the collection keeps the digits; see ptcgPrices().
 */
export const cardNumber = (n: string) =>
  // Zeros after a letter prefix go too: "SV01" is SV1, as pokemontcg.io writes it.
  n
    .trim()
    .toUpperCase()
    .replace(/^([A-Z]*)0+(?=\d)/, "$1");

/**
 * The letters a Black Star Promo set writes in front of every one of its numbers: XY123 is
 * card 123 of the XY promos, and a collector files it as 123.
 *
 * Read off the catalogue, not guessed (catalogue_cards, 2026-09-12): each is the prefix every
 * card of one TCGdex promo set carries, and that set's id is the prefix with a `p` after it
 * (xyp, smp, swshp, bwp, dpp, hgssp). SVP is pokemontcg.io's spelling of svp, whose TCGdex
 * numbers are bare. None of them opens a number anywhere else in the catalogue. The prefixes
 * that do (TG, GG, RC, SV, SH, SL, H, AR, RT, CC and the Unown letters) name a subset printed
 * after a set's main run, so they are kept: TG01 is not card 1. SV is Shiny Vault and SVP is
 * the promos, which is why SVP is matched whole and SV is not on this list.
 *
 * Context-free on purpose: the same rule has to hold in a sort, on a write and in a CHECK
 * constraint (supabase/migrations/20260912180000_promo_numbers_without_prefix.sql), and only a
 * rule about the number alone can be the same in all three.
 */
export const PROMO_PREFIXES = ["HGSS", "SWSH", "SVP", "XY", "SM", "BW", "DP"] as const;

/** A promo prefix, followed by a digit. Longest first, so SVP is never read as SV plus P. */
const PROMO_PREFIX = new RegExp(`^(?:${PROMO_PREFIXES.join("|")})(?=\\d)`, "i");

/**
 * A card number the way the collection stores it: trimmed, and for a promo, without the
 * promo set's letters (XY123 is 123, SWSH050 is 050, XY67a is 67A), so the row reads like
 * every other row of its set. Padding is left as written: the collection has both 74 and 013,
 * and numberForms() already makes those the same card. A gallery number keeps its letters.
 *
 * Every write of `cards.number` goes through this. The 2026-08-16 audit wrote TCGdex's XY123
 * straight to Postgres, and Venusaur EX sat under Pikachu EX 124 for a month.
 */
export const storedCardNumber = (n: string): string => {
  const trimmed = n.trim();
  return PROMO_PREFIX.test(trimmed) ? trimmed.replace(PROMO_PREFIX, "").toUpperCase() : trimmed;
};

type NumberKey = { run: string; digits: number; rest: string };

const numberKey = (n: string): NumberKey => {
  const s = storedCardNumber(n).toUpperCase();
  const m = /^([A-Z]*)(\d+)(.*)$/.exec(s);
  // No digits at all (Unown "A", HeartGold's "ONE", an empty number): a run of its own.
  if (!m) return { run: s, digits: -1, rest: "" };
  return { run: m[1] ?? "", digits: Number(m[2]), rest: m[3] ?? "" };
};

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Two card numbers in the order a binder holds them.
 *
 * The main run first, numerically (2, 10, 122), a letter after its number (67, 67A, 68). A promo
 * is the number it wraps (storedCardNumber), so XY123 sits between 122 and 124 whether its
 * neighbours carry the prefix or not. A subset (TG01, RC5, SV49) comes after the main run,
 * grouped by its letters and numeric within them. An empty number goes last. Ties fall to the
 * raw string, so the order is total and 043 and 43 do not swap between two sorts.
 */
export function compareCardNumbers(a: string, b: string): number {
  const ea = a.trim() === "";
  const eb = b.trim() === "";
  if (ea !== eb) return ea ? 1 : -1;
  const ka = numberKey(a);
  const kb = numberKey(b);
  if (ka.run !== kb.run) {
    if (ka.run === "") return -1;
    if (kb.run === "") return 1;
    return byString(ka.run, kb.run);
  }
  return ka.digits - kb.digits || byString(ka.rest, kb.rest) || byString(a, b);
}
