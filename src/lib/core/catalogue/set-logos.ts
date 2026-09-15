/**
 * A wordmark for every English set on the shelf, where TCGdex publishes none.
 *
 * TCGdex has no logo for 57 of its 203 English sets (2026-09-13): Temporal Forces, the Trainer
 * Galleries, every McDonald's Collection, the trainer kits. The collection filled that gap from
 * pokemontcg.io, and the shelf did not, so Bart saw Temporal Forces without one.
 * pokemontcg.io's API answers 500s and 502s most of the time (since 2026-09), but its image host
 * does not, and a set's logo there is at a fixed address: images.pokemontcg.io/<their id>/logo.png.
 * So the address is built from TCGdex's id and checked, and a set whose address is not there keeps
 * what it had. Only the nightly copy asks (mirror.ts), which puts the file in our bucket: a request
 * never does, and a client is sent only a file of ours (ownPicture in image-store.ts).
 *
 * And every Black Star Promos set wears the black star, the mark printed on the cards themselves,
 * where TCGdex gives Wizards' promos a wordmark and SVP's none (Bart: "moet wizard black star
 * promo's en svp promo's ook niet het promo icoontje hebben?").
 */
import PTCG_SET_IDS from "./ptcg-set-ids.json";
import type { CatalogueSet } from "./tcgdex-browse";

/**
 * The black star every promo set wears, which TCGdex publishes once, under the Sword & Shield
 * promos. It is not that set's branding: it is the mark printed on the cards themselves.
 */
export const PROMO_STAR = "https://assets.tcgdex.net/en/swsh/swshp/logo.webp";

const THEIRS: Record<string, string> = Object.fromEntries(
  Object.entries(PTCG_SET_IDS as Record<string, string>).map(([ptcg, tcgdex]) => [tcgdex, ptcg]),
);

/**
 * The ids pokemontcg.io may file a TCGdex set under, most likely first: the known exceptions,
 * then the patterns their ids follow ("sv05" is "sv5", "swsh12.5" is "swsh12pt5", "sm3.5" is
 * "sm35", "2023sv" is "mcd23").
 */
export function ptcgIdsFor(id: string): string[] {
  const out = new Set<string>();
  if (THEIRS[id]) out.add(THEIRS[id]);
  const mcd = id.match(/^20(\d\d)(bw|xy|sm|swsh|sv|me)$/);
  if (mcd) out.add(`mcd${mcd[1]}`);
  const unpadded = id.replace(/([a-z])0+(\d)/g, "$1$2");
  out.add(unpadded.replace(".", "pt"));
  out.add(unpadded.replace(".", ""));
  out.add(id);
  return [...out];
}

const DAY_MS = 86_400_000;
const checked = new Map<string, { at: number; url: Promise<string | null> }>();

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** Their logo's address for a set, where one is there, checked once a day per process. */
function theirLogo(id: string): Promise<string | null> {
  const known = checked.get(id);
  if (known && Date.now() - known.at < DAY_MS) return known.url;
  const url = (async () => {
    for (const theirs of ptcgIdsFor(id)) {
      const candidate = `https://images.pokemontcg.io/${theirs}/logo.png`;
      if (await exists(candidate)) return candidate;
    }
    return null;
  })();
  checked.set(id, { at: Date.now(), url });
  return url;
}

/** The sets with the black star on every promo set and pokemontcg.io's logo where TCGdex had none. */
export async function withSetLogos(sets: CatalogueSet[]): Promise<CatalogueSet[]> {
  return Promise.all(
    sets.map(async (set) => {
      if (/black star promos/i.test(set.name)) return { ...set, logo: PROMO_STAR };
      if (set.logo) return set;
      const logo = await theirLogo(set.id);
      return logo ? { ...set, logo } : set;
    }),
  );
}
