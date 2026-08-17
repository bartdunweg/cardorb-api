/**
 * Better pictures for a browsed set, from the catalogue that publishes them
 * smaller.
 *
 * ── The measurement this exists for ────────────────────────────────────────
 *
 * pokemontcg.io's `small` image is a 245×342 **PNG** at about 198 kB. TCGdex's
 * `low.webp` is the same 245×342 picture at about 26 kB. Same card, same pixels,
 * 7.6× the bytes, purely because one is PNG-with-alpha and the other is WebP.
 *
 * On a browse page that is not a rounding error: a 207-card set scrolled to the
 * end is roughly 41 MB of PNG against 5.4 MB of WebP. The JSON that describes
 * the whole set is 117 kB — three hundred times smaller than the pictures it
 * points at — so this is the only place in the feature where bytes are worth
 * an extra request.
 *
 * ── Why this is a swap and not a source change ─────────────────────────────
 *
 * Browse is built on pokemontcg.io because that is the catalogue that answers
 * "what is in this set" in one call with rarity and types attached (ADR-0037).
 * None of that changes. This runs afterwards and replaces the image URLs, card
 * by card, wherever TCGdex demonstrably has the same card — and leaves the PNG
 * in place wherever it does not. TCGdex's coverage gaps are exactly why ptcg.ts
 * exists as a fallback in the first place, so this cannot be a source swap.
 *
 * It is also the same resolution rule buildCollection() already applies to the
 * cards you own: same `byNumber` lookup, same `sameCard()` check, same
 * low/high pair off the same asset base. Which means a browsed set and the same
 * set in your collection stop being two different-looking grids.
 *
 * ── Why only the cards, and not the set logos ──────────────────────────────
 *
 * The set index draws 174 logos, and TCGdex's are 8 kB against pokemontcg.io's
 * 23 kB. Tempting, and not worth it: resolving 174 sets means 174 setCatalogue()
 * misses, each of which fetches a whole set's card list to answer a question
 * about one logo. Roughly 2.6 MB saved for 174 requests, against ~36 MB saved
 * here for one. The index keeps its PNGs and its lazy loading.
 */

import { setCatalogue } from "./catalogue";
import { sameCard } from "./matching";
import { localise, numberForms } from "./util";
import { tcgdexSetName } from "./set-aliases";
import type { CatalogueMatch } from "./ptcg-search";
import type { CatalogueSet } from "./ptcg-browse";

/**
 * The same cards, with TCGdex's scans wherever TCGdex has them.
 *
 * One extra request per set on a cold cache — setCatalogue() is keyed by set
 * name, cached for a day and shared by everybody, and browse is already working
 * one set at a time, so this is the cheapest possible place to ask. On a set
 * anybody owns cards from it is a cache hit and costs nothing at all.
 *
 * Fails soft, unlike everything else in this feature. A card catalogue that
 * cannot be reached is a 502 on the browse routes, because a set with no cards
 * in it is not an answer — but a *second* catalogue that cannot be reached only
 * means heavier pictures, and taking the page down over that would be trading a
 * working screen for a smaller one.
 */
export async function withTcgdexScans(
  set: CatalogueSet,
  cards: CatalogueMatch[],
): Promise<CatalogueMatch[]> {
  const name = tcgdexSetName(set.name);
  if (!name || !cards.length) return cards;

  let cat;
  try {
    cat = await setCatalogue(name);
  } catch (err) {
    console.error(`No TCGdex catalogue for ${set.name}, keeping pokemontcg.io scans:`, err);
    return cards;
  }

  /* A set TCGdex has recorded but not yet photographed answers every image URL
     with a 404 — see setHasScans in catalogue.ts, which spends one HEAD to find
     that out for the whole set rather than letting the browser find out card by
     card. Swapping in URLs known to be dead would be worse than the PNGs. */
  if (!cat.setHasScans) return cards;

  return cards.map((card) => {
    const match = numberForms(card.number)
      .map((form) => cat.byNumber[form.toLowerCase()])
      .find(Boolean);
    /* A number that lines up on a card by another name means the two catalogues
       number this set differently, and a confidently wrong picture is worse
       than a heavy right one. Same guard, same reason, as buildCollection()
       and ADR-0022. */
    if (!match?.name || !sameCard(match.name, card.name)) return card;

    const base =
      match.image ?? (match.localId && cat.assetBase ? `${cat.assetBase}/${match.localId}` : null);
    if (!base) return card;

    /* TCGdex carries the size as the last path segment, which is what makes a
       pair possible at all: pokemontcg.io publishes two fixed files and a
       fallback scan publishes one. low for the grid, high for whatever draws a
       card larger — the same pair OwnedCard has carried since cards.ts. */
    return {
      ...card,
      image: localise(`${base}/low.webp`),
      imageHigh: localise(`${base}/high.webp`),
    };
  });
}
