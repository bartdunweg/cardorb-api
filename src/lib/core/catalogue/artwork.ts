/**
 * Resolving scans that TCGdex does not have. Split out of cards.ts, where this
 * sat beside matching and collection assembly with no seam between them.
 */
import { DAY, numberForms, catalogueTimeout } from "../util";
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";
import { ownPicture } from "./image-store";

const PRODUCTS = TCGPLAYER_IDS as Record<string, { productId?: number } | null>;

/**
 * TCGplayer's scan of a card, found by the product the price links already name for it
 * (tcgplayer-ids.generated.json), so nothing is matched by set name or number.
 *
 * Measured on 2026-09-13 against the 649 cards the catalogue copy had no picture for: 474 have
 * a file here, every McDonald's Collection, Celebrations Classic Collection, Unseen Forces Unown
 * Collection, the Aquapolis and Skyridge holos and eight of the trainer kits. Unown A and the BW
 * kit's Lillipup were looked at: the card itself, scanned, not a product photo.
 *
 * The 1000 px file where there is one. A product with no picture answers 403, which reads as
 * none; so does a card the links do not name.
 */
export async function tcgplayerScan(cardId: string): Promise<string | null> {
  const product = PRODUCTS[cardId]?.productId;
  if (!product) return null;
  const url = `https://tcgplayer-cdn.tcgplayer.com/product/${product}_in_1000x1000.jpg`;
  try {
    const head = await fetch(url, {
      method: "HEAD",
      next: { revalidate: DAY },
      signal: catalogueTimeout(),
    });
    return head.ok ? url : null;
  } catch {
    return null;
  }
}

/**
 * Limitless publishes scans as soon as a set is out, at a path built from the
 * set's printed abbreviation, which is where a card too new for TCGdex comes
 * from. The path is guessed rather than looked up, so the file is checked
 * before the nightly copy takes it. Only the copy asks (mirror.ts): the answer
 * is still wrapped the way the cover proxy wanted it, because imageKey() and the
 * copy's held values read that shape, but the proxy itself is gone and no client
 * is sent the address (ownPicture in image-store.ts).
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
 * two fallback catalogues (pokemontcg.io and Limitless) publish a single file. That is exactly the 62.
 *
 * Kept on OwnedCard and on the API for now, because /v1/collection is a
 * published shape with a client that does not exist yet to renegotiate it
 * with. What changed is that the browser is no longer sent it.
 */
export function highScan(image: string | null): string | null {
  if (!image) return null;
  return (image.startsWith("https://assets.tcgdex.net/") ||
    image.startsWith("https://images.cardorb.com/")) &&
    image.endsWith("/low.webp")
    ? image.replace(/\/low\.webp$/, "/high.webp")
    : null;
}

/**
 * Japanese sets TCGdex photographed in a reverse-holo variant rather than the plain print.
 * Pokémon Card 151 (SV2a): every one of its scans is the Master Ball print (001, 011, 025 and
 * 150 looked at on 2026-09-11), so a shelf of commons read as a shelf of reverse holos.
 * The nightly copy takes Limitless's plain print for these without asking
 * TCGdex whether its file is there: it is, and it is the wrong one.
 */
const SCANNED_AS_REVERSE: ReadonlySet<string> = new Set(["SV2a"]);
export const tcgdexScanIsReverse = (setId: string | null): boolean =>
  !!setId && SCANNED_AS_REVERSE.has(setId);

/**
 * Where Limitless keeps a Japanese card's scan, guessed the way the English
 * one above is: from the set's printed abbreviation, which is the id TCGdex
 * uses for a Japanese set, and the number without its padding. SV5M-001 is
 * `tpc/SV5M/SV5M_1_R_JP_SM.png` there. Four sets checked by hand on
 * 2026-09-11, four present. SM (274×381) does the grid's job, LG (460×640)
 * the sheet's. Wrapped as the cover proxy wanted it, for the copy's sake (limitlessScan above).
 *
 * A promo set is the exception: Limitless files SV-P as SVP and M-P as MP, so
 * the hyphen goes. Until 2026-09-15 every guess for those two was a 403 and 27
 * of their cards had no picture; SV-P 188, 251, 280 and 290 and M-P 164 were
 * opened and are the cards their numbers say.
 *
 * Not checked here: the nightly copy (mirror-language.ts) is the one caller, and it finds out
 * when it copies the file into our bucket.
 */
export function limitlessJapaneseScan(id: string, number: string): { low: string; high: string } {
  const set = id.slice(0, id.lastIndexOf("-")).replaceAll("-", "");
  const n = number.replace(/^0+(?=\d)/, "");
  const at = (size: "SM" | "LG") =>
    `/api/cover?url=${encodeURIComponent(
      `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${set}/${set}_${n}_R_JP_${size}.png`,
    )}`;
  return { low: at("SM"), high: at("LG") };
}

/**
 * Scrydex's set id for the English sets no other catalogue has a picture of, read by hand.
 *
 * Scrydex publishes every scan at `images.scrydex.com/pokemon/<set>-<number>/large` with no key,
 * but it names its sets its own way and has no index to read without a paid account. So only a
 * set checked by eye is here: on 2026-09-14 the first card and one or two more of each were
 * opened beside the TCGdex list (Latios kit #1 Skitty, Bisharp kit #16 and #30 Bisharp,
 * Wigglytuff kit #14, Lycanroc kit #16, Alolan Raichu kit #17 and #26, the Gyarados kit's
 * Pokémon Communication at #22 and #27). The numbers agree with TCGdex's.
 */
const SCRYDEX_SETS: Record<string, string> = {
  "tk-xy-latio": "tk8a",
  "tk-xy-latia": "tk8b",
  "tk-xy-w": "tk7a",
  "tk-xy-b": "tk7b",
  "tk-sm-l": "tk10a",
  "tk-sm-r": "tk10b",
  "tk-hs-g": "tk4b",
  // Poké Card Creator Pack: TCGdex's ex5.5 is Scrydex's wb1, the same five cards by number (2026-09-14).
  "ex5.5": "wb1",
};

/** A card Scrydex files under a number the copy's does not say, read by hand. */
const SCRYDEX_CARDS: Record<string, string> = {
  // Pikachu at the Museum, a jumbo card, which Scrydex numbers 1000 in the promos.
  "mep-Museum": "mep-1000",
};

/**
 * What Scrydex answers for an id it does not have: a 200 with a stand-in picture, always this
 * file. Its ETag says so. Not its length: a request without a browser's headers is answered
 * compressed, with no Content-Length at all, which is how the first version of this refused
 * every real scan from the server (2026-09-14).
 */
const SCRYDEX_STAND_IN_ETAG = "cfl2loWl84E8tUjrC-Q-I0D0JhCRBILXPqV9Rt6Cz3DQ";

/**
 * Scrydex's scan of a card, the last catalogue asked (mirror.ts): 170 of the 178 English cards
 * no other source had a picture of on 2026-09-14, the six trainer kits TCGplayer sells without
 * photos. A 1 MB PNG; the copy in our bucket is what is served.
 */
export async function scrydexScan(setId: string, number: string): Promise<string | null> {
  const set = SCRYDEX_SETS[setId];
  const n = number.replace(/^0+(?=\d)/, "");
  const card =
    SCRYDEX_CARDS[`${setId}-${number}`] ?? (set && /^\d+$/.test(n) ? `${set}-${n}` : null);
  if (!card) return null;
  const url = `https://images.scrydex.com/pokemon/${card}/large`;
  try {
    const head = await fetch(url, {
      method: "HEAD",
      next: { revalidate: DAY },
      signal: catalogueTimeout(),
    });
    const etag = head.headers.get("etag");
    return head.ok && etag && !etag.includes(SCRYDEX_STAND_IN_ETAG) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Whether a stored picture address is a whole file rather than a scan's folder.
 *
 * TCGdex's addresses are folders: the size and the format are the reader's, `${stem}/low.webp`.
 * The two fallbacks publish one file each, and a file is what the catalogue's copy keeps for a
 * card TCGdex has no scan of. A path on this origin is the old cover proxy's shape, also a file.
 */
export const isScanFile = (value: string): boolean =>
  value.startsWith("/") || /\.(webp|png|jpe?g)(\?|$)/i.test(value);

/**
 * The small and the large address for a stored picture: both sizes of a stem, or the one file
 * there is. Null in, null out, which is a card that draws as its name.
 */
export const storedScan = (
  value: string | null | undefined,
): { image: string | null; imageHigh: string | null } =>
  !value
    ? { image: null, imageHigh: null }
    : isScanFile(value)
      ? { image: value, imageHigh: null }
      : { image: `${value}/low.webp`, imageHigh: `${value}/high.webp` };

/**
 * storedScan() for an answer a client is sent: an address that is not a file of ours reads as no
 * picture at all (ownPicture in image-store.ts). The nightly copy reads storedScan() itself, because
 * an outside address is exactly what it copies from.
 */
export const ownScan = (
  value: string | null | undefined,
): { image: string | null; imageHigh: string | null } => storedScan(ownPicture(value));
