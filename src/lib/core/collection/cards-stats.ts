/**
 * What one card is worth, and how many of it are held.
 *
 * Two functions, both pure, both about a single card: countStats() in
 * ./items.ts adds them up for /v1/stats, movers.ts multiplies by them, and the
 * nightly snapshot uses the same pair so the tile and the chart cannot disagree
 * about what a binder is worth.
 *
 * ── What used to be here, and why it is not ────────────────────────────────
 *
 * getCardsStats(), a whole-collection tally: totals, a wishlist figure, a top
 * ten, era and type breakdowns, and a `movement` percentage. It was the
 * dashboard's numbers for /cards — a page that left this repository with the
 * web tool on 2026-09-02. Nothing has referenced it since except its own test
 * file, and `/v1/stats` answers from countStats().
 *
 * It was deleted rather than kept warm, because it was not merely unused: its
 * `movement` paired `p.market` against `p.avg30`, which is the one pairing the
 * comment directly above it forbade. That reads honestly on a Cardmarket-only
 * price, where `market` is the raw trend — and this collection's prices are
 * blended (see blendPrices in ../price-basis.mjs), so `market` is the average
 * of Cardmarket's Near Mint estimate and TCGplayer's dollars in euros, while
 * `avg30` stays Cardmarket's raw month. A card whose trend, month's average and
 * dollar market are all the same number reported +13.75%: the Near Mint band,
 * halved, read as a market movement. Measured, not reasoned about.
 *
 * Nothing could reach it, so nothing was wrong today. What made it worth
 * deleting is that twenty-one green tests said the arithmetic was fine, and
 * they would have gone on saying so on the day somebody wired it to a route.
 * The question it half-answered is answered properly by ./movers.ts, out of the
 * recorded daily readings rather than out of two figures that do not pair.
 */

import { shownPrice, variantPrice } from "./cards";
import type { OwnedCard } from "./cards";

/**
 * How many copies of this card are actually in the binder.
 *
 * Summed over the owned variants, because that is where a quantity lives: a
 * card held normally and again as a reverse holo is one OwnedCard with two
 * Variants, and each carries its own count (see Variant, and the 2026-08-14
 * per-variant inventory fields). A wishlist variant is not a copy however many
 * of it is wanted, so `owned` gates the sum rather than filtering afterwards.
 *
 * `excluded` deliberately does not gate it. That flag means "keep this out of
 * the latest-pull feed on the portfolio site" — the card is still held, and a
 * valuation that quietly dropped it would be wrong in the one direction nobody
 * checks.
 *
 * Math.max guards a row that somehow holds a negative: the column has a check
 * constraint, but this also runs on drafts and on whatever a CSV import made,
 * and a negative here would subtract from the collection's value.
 *
 * A null quantity counts as nothing rather than as one. That is a public
 * payload — forPublic() nulls it, because how many of a card somebody holds is
 * theirs to know — and a stranger's browser has no business totalling a
 * collection it was deliberately not told the size of. In practice it never
 * arises: CardsView computes no stats at all when it is public.
 */
export const copiesHeld = (card: OwnedCard): number =>
  card.variants.reduce((n, v) => n + (v.owned ? Math.max(0, v.quantity ?? 0) : 0), 0);

/**
 * What the copies of this card are worth, added up printing by printing.
 *
 * Not `shownPrice(card.price) * copiesHeld(card)`, which is what this used to
 * be and what was wrong once a copy could say it was a foil: Cardmarket prices
 * the reverse holo separately, at a median of twice the normal printing, and a
 * card held both ways has two copies worth different amounts. See
 * variantPrice().
 *
 * Null-safe on both sides. A card with no price at all contributes nothing, and
 * a variant with no quantity contributes nothing, and neither is the same as
 * contributing zero euros — the caller decides how to say "unpriced", which is
 * what `unpriced` beside `value` on Stats is for.
 */
export const heldValue = (card: OwnedCard): number =>
  card.variants.reduce((sum, v) => {
    if (!v.owned) return sum;
    const each = shownPrice(variantPrice(card, v));
    return each == null ? sum : sum + each * Math.max(0, v.quantity ?? 0);
  }, 0);
