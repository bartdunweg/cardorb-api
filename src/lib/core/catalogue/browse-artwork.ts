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
 * "what is in this set" in one call with rarity and types attached.
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
import { tcgdexScan } from "./artwork";
import { sameCard } from "./matching";
import { localise, numberForms } from "../util";
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
       and the name check. */
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
      // The match is already made here, so the id travels with the pictures rather than being
      // worked out a second time by whoever wants to price the card.
      tcgId: match.id || null,
      image: localise(`${base}/low.webp`),
      imageHigh: localise(`${base}/high.webp`),
    };
  });
}

/**
 * Limitless's scans for a Japanese set TCGdex has not photographed.
 *
 * ── The measurement this exists for ────────────────────────────────────────
 *
 * The Japanese shelf hands out TCGdex's picture address for every card without
 * asking whether a file is behind it, and on 2026-09-11 there was none behind
 * 41 of 72 sampled cards across eight sets — whole sets at a time (SV5M, SM12a,
 * SM1M: 12 of 12), the odd card elsewhere (SV5a: 1 of 12). Traditional Chinese
 * was 44 of 60; English 1 of 96. A set page of grey boxes with names in them.
 *
 * Limitless has the Japanese scans, at an address built from the set's printed
 * abbreviation — which is what TCGdex uses as the set's id on this shelf, so
 * SV5M-001 is `tpc/SV5M/SV5M_1_R_JP_SM.png`. Checked on the four sets above:
 * four of four. The same guess the English fallback makes in artwork.ts, in
 * the other catalogue's folder. Japanese only: Limitless carries no Korean or
 * Chinese cards, and those shelves keep what they had.
 *
 * ── Why one probe per set and not one per card ─────────────────────────────
 *
 * The gaps are mostly whole sets, so one HEAD on the first card says which
 * kind of set this is: photographed, and every card keeps TCGdex's smaller
 * file (19 kB against Limitless's 62 kB); or not, and every card gets the
 * guess. The odd missing card in a photographed set stays a gap — that is one
 * in twelve, against 250 HEADs a set to close it, and the page has a better
 * answer for a single gap than a second catalogue. The guess itself is not
 * checked either, for the same reason: the browser finds out, the way it did
 * before this existed, and a 404 there costs exactly what it cost.
 */
export async function withLimitlessScans(
  lang: string,
  cards: CatalogueMatch[],
): Promise<CatalogueMatch[]> {
  if (lang !== "ja" || !cards.length) return cards;
  const first = cards[0]!.image;
  if (!first) return cards;
  // The set's own scans exist: keep every card's. tcgdexScan() answers the
  // path itself when the probe cannot be made, which reads as "keep" here —
  // an unanswered check is not a reason to swap a whole set's pictures.
  if (await tcgdexScan(first.replace(/\/low\.webp$/, ""))) return cards;

  return cards.map((card) => {
    // SV5M-001 is Limitless's SV5M_1: the set id as TCGdex writes it, the
    // number without its padding. A number that is not digits (a promo's "SV-P")
    // is left as it is, and the guess is simply wrong for it, as it is today.
    const set = card.id.slice(0, card.id.lastIndexOf("-"));
    const number = card.number.replace(/^0+(?=\d)/, "");
    const at = (size: "SM" | "LG") =>
      `/api/cover?url=${encodeURIComponent(
        `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${set}/${set}_${number}_R_JP_${size}.png`,
      )}`;
    // SM (274×381) for the grid, LG (460×640) for the sheet: the same two
    // jobs TCGdex's low and high do, at the nearest sizes Limitless publishes.
    return { ...card, image: at("SM"), imageHigh: at("LG") };
  });
}
