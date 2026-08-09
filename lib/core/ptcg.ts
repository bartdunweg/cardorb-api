/**
 * The second catalogue, for what the first one has not published.
 *
 * TCGdex is where /cards gets everything, and it is missing a handful of
 * pictures rather than a handful of facts: Temporal Forces has no set logo at
 * all, and the priciest card in the binder (a €440 Pikachu with a grey felt
 * hat) has no scan. Neither is going to be fixed by asking again, and both
 * exist at pokemontcg.io.
 *
 * So this is a fallback and nothing else. It is consulted only where the first
 * source came back empty, one index request per build, and it never overrides
 * anything TCGdex does have. Keeping it here rather than in lib/cards.ts is the
 * point: the day it goes away, one file's worth of picture-of-last-resort goes
 * with it and the page is exactly as complete as TCGdex is.
 */

import { DAY, norm } from "./util";

type PtcgSet = { id: string; name: string; images?: { logo?: string } };

/**
 * Where the two catalogues call the same set by different names.
 *
 * Only the promos, and only because the name here follows what the collection
 * calls them. Everything else in 174 sets matches on the name alone, which is
 * why this is three lines rather than a mapping table.
 */
/* Keyed by the normalised name, which is what the lookup below has in hand:
   norm() strips the spaces and the ampersand, so a key written out in words
   would never match. */
const ALIAS: Record<string, string> = {
  svblackstarpromos: "Scarlet & Violet Black Star Promos",
};

let index: Promise<Map<string, PtcgSet>> | null = null;

/**
 * Their whole set list, by name, fetched once and cached for a day.
 *
 * With retries, because this host answers 500 and 502 more often than it does
 * not, and one refusal used to take both of the pictures this file exists for
 * off the page: the promise is module-level, so the empty map it resolved to
 * was then handed to all 1,622 cards for the rest of the build. A failure is
 * not cached now: the next caller tries again, and only a build where every
 * attempt failed ends up where it started, which is where it was before this
 * file existed.
 */
function sets(): Promise<Map<string, PtcgSet>> {
  index ??= (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("https://api.pokemontcg.io/v2/sets", { next: { revalidate: DAY } });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data?: PtcgSet[] };
        const out = new Map<string, PtcgSet>();
        for (const set of body.data ?? []) out.set(norm(set.name), set);
        if (out.size) return out;
        throw new Error("empty set index");
      } catch (err) {
        if (attempt === 2) {
          // A fallback that cannot be reached is not an error worth failing a
          // build over: the page renders with whatever TCGdex gave it.
          console.error("pokemontcg.io set index unavailable:", err);
          index = null;
          return new Map<string, PtcgSet>();
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return new Map<string, PtcgSet>();
  })();
  return index;
}

const find = async (setName: string) => {
  const all = await sets();
  const key = norm(setName);
  const alias = ALIAS[key];
  return (alias ? all.get(norm(alias)) : null) ?? all.get(key) ?? null;
};

/** Their logo for a set, when they have one and TCGdex does not. */
export async function ptcgLogo(setName: string): Promise<string | null> {
  return (await find(setName))?.images?.logo ?? null;
}

/**
 * Their scan of one card, guessed from the set they file it under.
 *
 * Their card images are addressed by set and number with no leading zeros, so
 * once the set is known the URL is not a lookup. A HEAD confirms it before the
 * page is told the picture exists; a card they have not published either
 * answers 404 here and keeps its empty slot.
 */
export async function ptcgScan(setName: string, number: string): Promise<string | null> {
  const set = await find(setName);
  if (!set) return null;
  const n = number.replace(/^0+/, "");
  if (!n) return null;
  const url = `https://images.pokemontcg.io/${set.id}/${n}.png`;
  try {
    const head = await fetch(url, { method: "HEAD", next: { revalidate: DAY } });
    return head.ok ? url : null;
  } catch {
    return null;
  }
}
