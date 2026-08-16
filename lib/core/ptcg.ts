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
import { sameCard } from "./matching";
import { isGalleryNumber, ptcgSetName } from "./set-aliases";

type PtcgSet = { id: string; name: string; images?: { logo?: string } };

/* Where the two catalogues call the same set by different names — three
   entries, and they moved to set-aliases.ts once browse started asking the same
   question in the opposite direction. See that file for why the table is short
   and why it is not the one in catalogue.ts. */

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
  const alias = ptcgSetName(setName);
  return (alias ? all.get(norm(alias)) : null) ?? all.get(norm(setName)) ?? null;
};

/* A gallery number: Trainer Gallery's TG01 and up, Crown Zenith's GG01 and up.
   Defined in set-aliases.ts beside the set-name half of the same rule, and
   re-exported here because this is where it was written and where callers look
   for it. */
export { isGalleryNumber } from "./set-aliases";

/**
 * The gallery subset of a set, when they file one.
 *
 * A Sword & Shield set keeps its Trainer Gallery cards in a set of its own, and
 * both catalogues name it by extending the parent — "Silver Tempest Trainer
 * Gallery", "Crown Zenith Galarian Gallery". The collection files them under the
 * parent, the way a collector thinks about them, so a TG number arrives here
 * asking for a set this index does not have under that name.
 *
 * Matched by prefix rather than by building the name, for the same reason
 * resolveSetIds() does it (lib/core/catalogue.ts): "Trainer" and "Galarian" are
 * not the only two words this could ever be, and a prefix that also says
 * "gallery" cannot drag in an unrelated set.
 */
const findGallery = async (setName: string) => {
  const all = await sets();
  const parent = norm(setName);
  if (!parent) return null;
  for (const [name, set] of all) {
    if (name !== parent && name.startsWith(parent) && name.includes("gallery")) return set;
  }
  return null;
};

/** Their logo for a set, when they have one and TCGdex does not. */
export async function ptcgLogo(setName: string): Promise<string | null> {
  return (await find(setName))?.images?.logo ?? null;
}

/**
 * The names in one of their sets, by number, fetched once per set and cached
 * for a day.
 *
 * Only ever asked for a gallery set, and only to answer "is TG04 the card this
 * row says it is". That question is worth a request because the collection's
 * gallery numbering does not line up with anyone's: every one of the 23 gallery
 * rows in it is filed under a number that belongs to a different card, so the
 * URL this file would otherwise build lands on the wrong Pokémon every time.
 * The whole point of the second catalogue is the pictures TCGdex lacks; a wrong
 * one is worse than the empty slot it replaces.
 */
const cardNames = new Map<string, Promise<Map<string, string>>>();

function namesIn(setId: string): Promise<Map<string, string>> {
  let pending = cardNames.get(setId);
  if (pending) return pending;
  pending = (async () => {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&select=number,name&pageSize=250`;
    try {
      const res = await fetch(url, { next: { revalidate: DAY } });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { data?: { number?: string; name?: string }[] };
      const out = new Map<string, string>();
      for (const c of body.data ?? []) if (c.number && c.name) out.set(norm(c.number), c.name);
      if (!out.size) throw new Error("empty card list");
      return out;
    } catch (err) {
      // Not cached, for the same reason the set index is not: this host answers
      // 500 and 502 often enough that one refusal must not decide the whole
      // build. An empty map means "unverifiable", which the caller reads as no.
      console.error(`pokemontcg.io card list unavailable for ${setId}:`, err);
      cardNames.delete(setId);
      return new Map<string, string>();
    }
  })();
  cardNames.set(setId, pending);
  return pending;
}

/**
 * Their scan of one card, guessed from the set they file it under.
 *
 * Their card images are addressed by set and number with no leading zeros, so
 * once the set is known the URL is not a lookup. A HEAD confirms it before the
 * page is told the picture exists; a card they have not published either
 * answers 404 here and keeps its empty slot.
 *
 * A gallery number is looked up against the gallery subset first, and that is
 * the whole reason a TG card can be found here when it cannot be found at
 * Limitless: this address is the printed number under a set of its own, where
 * Limitless renumbers gallery cards into the parent's run and finding them there
 * would mean guessing an offset (see lib/core/catalogue.ts).
 *
 * It is also the one lookup here that is checked against the row's name before
 * it is believed, which is the same guard buildCollection() puts on a TCGdex
 * match and for the same reason. It earns its request: the collection's gallery
 * numbering matches neither catalogue, so without it every gallery row would
 * come back with a picture of a different Pokémon. `name` is optional only so
 * the ordinary path, where the number is the collection's own and has already
 * been trusted for years, does not pay for a card list it has no use for.
 */
export async function ptcgScan(
  setName: string,
  number: string,
  name?: string,
): Promise<string | null> {
  const gallery = isGalleryNumber(number) ? await findGallery(setName) : null;
  const set = gallery ?? (await find(setName));
  if (!set) return null;
  const n = number.replace(/^0+/, "");
  if (!n) return null;
  if (gallery) {
    const theirs = (await namesIn(gallery.id)).get(norm(n));
    // No name to check against, no card at that number, a card by another name,
    // or a card list this host would not hand over: all of them mean the empty
    // slot stays. Only a number that demonstrably holds this card gets a picture.
    if (!name || !theirs || !sameCard(theirs, name)) return null;
  }
  const url = `https://images.pokemontcg.io/${set.id}/${n}.png`;
  try {
    const head = await fetch(url, { method: "HEAD", next: { revalidate: DAY } });
    return head.ok ? url : null;
  } catch {
    return null;
  }
}
