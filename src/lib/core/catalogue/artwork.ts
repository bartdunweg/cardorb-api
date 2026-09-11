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
 * Is there a file behind a TCGdex path we worked out ourselves?
 *
 * TCGdex lists a gallery subset's cards with no `image` at all while the files
 * do exist, filed under the parent set — which is why cards.ts builds the path
 * from the set's asset base rather than giving up. The same is true of cards
 * TCGdex simply has no scan of, and there the built path is a 404: Mewtwo & Mew
 * GX (SM Black Star Promos SM191) is one, and pokemontcg.io has that scan, but
 * the fallback chain never ran because a fabricated URL is not a missing one.
 *
 * So the guess is checked before it is handed out, the way the Limitless guess
 * beside it always has been. A day's cache, because a scan that appears does so
 * once.
 */
export async function tcgdexScan(base: string): Promise<string | null> {
  try {
    const head = await fetch(`${base}/low.webp`, {
      method: "HEAD",
      next: { revalidate: DAY },
      signal: catalogueTimeout(),
    });
    return head.ok ? base : null;
  } catch {
    // A probe that cannot be made is not proof of absence: hand the path over
    // and let the browser find out, which is what happened before this existed.
    return base;
  }
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

/**
 * Where Limitless keeps a Japanese card's scan, guessed the way the English
 * one above is: from the set's printed abbreviation, which is the id TCGdex
 * uses for a Japanese set, and the number without its padding — SV5M-001 is
 * `tpc/SV5M/SV5M_1_R_JP_SM.png` there. Four sets checked by hand on
 * 2026-09-11, four present. SM (274×381) does the grid's job, LG (460×640)
 * the sheet's; through /api/cover, because Limitless sends no CORS header.
 *
 * Not checked here. The two callers decide differently whether to ask —
 * a set page probes once per set, a collection once per card — and both
 * hand the guess over unverified, which costs what a dead TCGdex address
 * cost before: the browser finds out, and draws the card's back.
 */
export function limitlessJapaneseScan(id: string, number: string): { low: string; high: string } {
  const set = id.slice(0, id.lastIndexOf("-"));
  // A number that is not digits (a promo's "SV-P") is left as it is, and the
  // guess is simply wrong for it.
  const n = number.replace(/^0+(?=\d)/, "");
  const at = (size: "SM" | "LG") =>
    `/api/cover?url=${encodeURIComponent(
      `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${set}/${set}_${n}_R_JP_${size}.png`,
    )}`;
  return { low: at("SM"), high: at("LG") };
}
