/**
 * Resolving scans that TCGdex does not have. Split out of cards.ts, where this
 * sat beside matching and collection assembly with no seam between them.
 */
import { DAY, numberForms, catalogueTimeout } from "../util";

/**
 * Limitless publishes scans as soon as a set is out, at a path built from the
 * set's printed abbreviation, which is where a card too new for TCGdex comes
 * from. The path is guessed rather than looked up, so the file is checked
 * before it is handed out, and it is served through our own origin because
 * Limitless sends no CORS header.
 *
 * The code is the abbreviation ("SSP"), not the TCGdex id ("sv08"). That was
 * the bug: every guess was built as SV08_088 and quietly 403'd, so a fallback
 * that looked like it was working had in fact never returned a single scan.
 */
export async function limitlessScan(code: string, number: string): Promise<string | null> {
  for (const id of numberForms(number)) {
    const guess = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${code}/${code}_${id}_R_EN_LG.png`;
    try {
      const head = await fetch(guess, {
        method: "HEAD",
        next: { revalidate: DAY },
        signal: catalogueTimeout(),
      });
      if (head.ok) return `/api/cover?url=${encodeURIComponent(guess)}`;
    } catch {
      // try the next form
    }
  }
  return null;
}

/**
 * The large scan for a card, worked out rather than carried.
 *
 * `imageHigh` used to travel with every card and it is pure redundancy: over
 * the whole collection, 1,548 of the 1,548 cards that have one are exactly
 * their own `image` with "low" swapped for "high", and none of the 62 that
 * lack one match that shape. So the field is 105 kB — 13.6% of the payload —
 * restating a string the client already holds.
 *
 * The rule is the host, not the URL shape: TCGdex publishes both sizes, and the
 * two fallback catalogues (pokemontcg.io, and Limitless through /api/cover)
 * publish a single file. That is exactly the 62.
 *
 * Kept on OwnedCard and on the API for now, because /v1/collection is a
 * published shape with a client that does not exist yet to renegotiate it
 * with. What changed is that the browser is no longer sent it.
 */
export function highScan(image: string | null): string | null {
  if (!image) return null;
  return image.startsWith("https://assets.tcgdex.net/") && image.endsWith("/low.webp")
    ? image.replace(/\/low\.webp$/, "/high.webp")
    : null;
}
