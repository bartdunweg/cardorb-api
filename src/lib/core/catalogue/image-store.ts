/**
 * Our own copy of every card picture, in the Cloudflare R2 bucket `cardorb-images`, read at
 * images.cardorb.com.
 *
 * Until 2026-09-14 the catalogue copy kept an address and nothing else: TCGdex's folder for a
 * card, or a file at pokemontcg.io, Limitless or TCGplayer. Each of those is someone else's host
 * (TCGdex is one server with no CDN, pokemontcg.io refuses most calls), and a host that stops
 * answering blanked every card it served. So a picture is copied once, and the copy is what the
 * catalogue hands out from then on.
 *
 * ── The key is the source's path ───────────────────────────────────────────
 *
 * TCGdex's `en/swsh/swsh11/186` stays `en/swsh/swsh11/186`, with `low.webp` and `high.webp`
 * under it, so a stored value is still a folder and everything that reads one (storedScan, the
 * index document's per-set folder) reads ours unchanged. A single file from another catalogue is
 * filed under that catalogue's name: `pokemontcg/sm75/1.png`, `limitless/tpci/DRM/DRM_024_R_EN_LG.png`,
 * `tcgplayer/90168.jpg`. No table remembers the mapping because the source's address is the
 * mapping.
 *
 * ── Writes go through a Worker ─────────────────────────────────────────────
 *
 * `cloudflare/images-writer` holds the bucket binding and checks IMAGES_WRITE_SECRET. Without
 * the secret nothing is copied and every address stays the source's, which is how this ran
 * before and how a local build or a test runs.
 */
import { catalogueTimeout } from "../util";

export const IMAGES_ORIGIN = "https://images.cardorb.com";
const WRITER = "https://cardorb-images-writer.bart-dunweg.workers.dev";

/** The file types the writer accepts, by the extension a key ends in. */
const TYPE_OF: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };

const writeSecret = () => process.env.IMAGES_WRITE_SECRET?.trim() || null;

/**
 * A file the bucket is known to hold, read at the public address before anything is handed out
 * there. The secret can be set before images.cardorb.com points at the bucket, and an address
 * nobody can load is worse than the source's: this keeps the copy on the source until it can.
 */
const PROBE = `${IMAGES_ORIGIN}/en/swsh/swsh11/186/low.webp`;

/** Whether this runtime can copy pictures and hand out the copies' addresses. */
export async function canStoreImages(): Promise<boolean> {
  if (!writeSecret()) return false;
  try {
    const head = await fetch(PROBE, {
      method: "HEAD",
      cache: "no-store",
      signal: catalogueTimeout(),
    });
    return head.ok;
  } catch {
    return false;
  }
}

/**
 * Where a stored or source address lives in our bucket, or null for an address that is already
 * ours or comes from a host we do not copy from.
 */
export function imageKey(address: string): string | null {
  if (address.startsWith(`${IMAGES_ORIGIN}/`)) return null;
  // The cover proxy wraps a Limitless file: the file inside is what is copied.
  if (address.startsWith("/api/cover?url=")) {
    const inner = decodeURIComponent(address.slice("/api/cover?url=".length));
    return imageKey(inner);
  }
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/^\/+/, "");
  if (!path || path.split("/").some((p) => p === "." || p === "..")) return null;
  switch (url.hostname) {
    case "assets.tcgdex.net":
      return path;
    case "images.pokemontcg.io":
      return `pokemontcg/${path}`;
    case "limitlesstcg.nyc3.cdn.digitaloceanspaces.com":
      return `limitless/${path}`;
    case "images.scrydex.com": {
      // pokemon/tk7b-16/large: the file has no extension, and a key needs one to be a file.
      const card = /^pokemon\/([A-Za-z0-9._-]+)\/large$/.exec(path)?.[1];
      if (card) return `scrydex/${card}.png`;
      // pokemon/sv2a_ja-logo/logo: a set's wordmark (scrydex-japan-logos.ts).
      const logo = /^pokemon\/([a-z0-9_]+)-logo\/logo$/.exec(path)?.[1];
      return logo ? `scrydex/logos/${logo}.png` : null;
    }
    case "tcgplayer-cdn.tcgplayer.com": {
      const product = /^product\/(\d+)_/.exec(path)?.[1];
      return product ? `tcgplayer/${product}.jpg` : null;
    }
    default:
      return null;
  }
}

/** Whether an address is a file in our own bucket. */
export const isOurs = (address: string | null | undefined): address is string =>
  !!address && address.startsWith(`${IMAGES_ORIGIN}/`);

/**
 * A picture as a client may be sent it: a file in our bucket, or null.
 *
 * Bart, 2026-09-15: every picture a client is sent is a file of ours. An answer built while
 * serving a request never names TCGdex, pokemontcg.io, Limitless, Scrydex or TCGplayer, and never
 * the cover proxy in front of one: a card or a set with no file of ours carries null, and the
 * clients draw their placeholder. Getting the file into the bucket is the nightly copy's job,
 * which asks again every night for what is still blank.
 */
export const ownPicture = (address: string | null | undefined): string | null =>
  isOurs(address) ? address : null;

/** A card's two scans through ownPicture(), everything else about it as it was. */
export const withOwnScans = <T extends { image: string | null; imageHigh?: string | null }>(
  card: T,
): T => ({
  ...card,
  image: ownPicture(card.image),
  ...("imageHigh" in card ? { imageHigh: ownPicture(card.imageHigh) } : {}),
});

/** A set's wordmark and symbol through ownPicture(), everything else about it as it was. */
export const withOwnArt = <T extends { logo: string | null; symbol?: string | null }>(
  set: T,
): T => ({
  ...set,
  logo: ownPicture(set.logo),
  ...("symbol" in set ? { symbol: ownPicture(set.symbol) } : {}),
});

/**
 * What the copy writes for a picture it may already hold: a file of ours stands. A run that found
 * another file of ours writes that; a run that found nothing, or only somebody else's address,
 * keeps the one held. Bart, 2026-09-15: every picture lives in our bucket, and an outside source
 * that is down for a night (Scrydex's 524 blanked every Japanese logo that morning) or a bucket
 * check that timed out never takes one away.
 */
export const heldUnlessOurs = (
  held: string | null | undefined,
  found: string | null,
): string | null => (isOurs(found) ? found : isOurs(held) ? held : found);

/** What an address becomes once its picture is in the bucket. */
export const storedAddress = (address: string): string | null => {
  const key = imageKey(address);
  return key ? `${IMAGES_ORIGIN}/${key}` : null;
};

const writerAt = (key: string) => `${WRITER}/${key.split("/").map(encodeURIComponent).join("/")}`;

/**
 * One file into the bucket, unless it is there already. True when the bucket holds it after.
 *
 * Whether it is there is asked at the public address, not the Worker: a Worker on the free plan
 * answers 100,000 requests a day, and a first pass over the catalogue is some 40,000 files.
 */
async function copyFile(source: string, key: string, secret: string): Promise<boolean> {
  const type = TYPE_OF[key.slice(key.lastIndexOf(".") + 1).toLowerCase()];
  if (!type) return false;
  const auth = { authorization: `Bearer ${secret}` };
  try {
    const there = await fetch(`${IMAGES_ORIGIN}/${key}`, {
      method: "HEAD",
      cache: "no-store",
      signal: catalogueTimeout(),
    });
    if (there.ok) return true;
    const file = await fetch(source, { cache: "no-store", signal: catalogueTimeout() });
    if (!file.ok) return false;
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) return false;
    const put = await fetch(writerAt(key), {
      method: "PUT",
      headers: { ...auth, "content-type": type },
      body: bytes,
      cache: "no-store",
      signal: catalogueTimeout(),
    });
    return put.status === 201;
  } catch {
    return false;
  }
}

/**
 * Whether TCGdex lists a scan folder it has no file behind: its small or large scan answers 404.
 *
 * Nine English cards on 2026-09-14, among them Team Magma's Numel (dc1-1), where neither file is
 * there, and Leftovers (sv03.5-163), whose small scan is and whose large one is not. The record
 * names the scan, so the catalogue copy never treated them as gaps and asked nobody else. Only a
 * 404 counts: a TCGdex that does not answer at all is an outage, not a missing picture.
 */
export async function tcgdexFolderMissing(stem: string): Promise<boolean> {
  if (!stem.startsWith("https://assets.tcgdex.net/")) return false;
  try {
    const answers = await Promise.all(
      ["low", "high"].map((size) =>
        fetch(`${stem}/${size}.webp`, {
          method: "HEAD",
          cache: "no-store",
          signal: catalogueTimeout(),
        }),
      ),
    );
    return answers.some((a) => a.status === 404);
  } catch {
    return false;
  }
}

/**
 * The address to keep for a picture: ours once it is copied, the source's while it cannot be.
 *
 * A TCGdex folder is two files, the small and the large scan, and becomes ours only when both
 * are in the bucket: a folder whose `high.webp` is missing would open the card sheet on nothing.
 * A copy that fails is not an error. The source's address still draws the card, and the next
 * refresh of the set tries again.
 */
export async function keepImage(address: string | null): Promise<string | null> {
  if (!address) return address;
  const secret = writeSecret();
  const key = imageKey(address);
  if (!secret || !key) return address;
  const source = address.startsWith("/api/cover?url=")
    ? decodeURIComponent(address.slice("/api/cover?url=".length))
    : address;
  const isFolder = !/\.(webp|png|jpe?g)$/i.test(key);
  const copied = isFolder
    ? (
        await Promise.all([
          copyFile(`${source}/low.webp`, `${key}/low.webp`, secret),
          copyFile(`${source}/high.webp`, `${key}/high.webp`, secret),
        ])
      ).every(Boolean)
    : await copyFile(source, key.replace(/\.jpeg$/i, ".jpg"), secret);
  return copied ? `${IMAGES_ORIGIN}/${key.replace(/\.jpeg$/i, ".jpg")}` : address;
}
