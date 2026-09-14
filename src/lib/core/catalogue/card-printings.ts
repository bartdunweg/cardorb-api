import { EDITIONS, FINISHES, isFoilPattern } from "../collection/collection-row";
import type { Edition, Finish, FoilPattern } from "../collection/collection-row";
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";
import TCGPLAYER_PATTERNS from "../tcgplayer-patterns.generated.json";

/**
 * Which printings of a card exist, and which print runs, from what TCGdex says per card.
 *
 * The apps have had the rule for a while: a form offers no finish and no foil that is not in
 * this list, and offers everything where the list is empty, because empty is the catalogue
 * having no answer rather than none existing. What they did not have is the list. The card route
 * answered `firstEdition` and nothing else, so every client took the "no answer" branch on every
 * card, and Pikachu with Grey Felt Hat — a promo TCGdex knows as a plain normal — offered a
 * holo, a reverse holo, a Poké Ball reverse and a Master Ball reverse.
 *
 * `variants_detailed` is where the answer is: one entry per printing, each with a `type`
 * (normal, holo, reverse) and, where the foil has a name, a `foil`. The Poké Ball and Master
 * Ball prints are reverses whose foil TCGdex names, which settles a question this code used to
 * leave open: they were offered on every card with any reverse because nothing was thought to
 * say which cards got one.
 *
 * Since 2026-09-14 those patterned reverses come from TCGplayer's products instead, where the card
 * has a TCGplayer link (finishPrintsFor): TCGdex named a Poké Ball reverse on eight basic energies
 * TCGplayer never sold one of, and had no word for the Energy Symbol reverse beside the ex era's
 * own energy foil.
 */

/** One printing of a card: what it is, and what its foil looks like where that has a name. */
export type Printing = { finish: Finish; foilPattern: FoilPattern | null };

/** TCGdex' `type` on a variant, in this app's words. Anything else is a printing we do not model. */
const FINISH_OF: Record<string, Finish> = {
  normal: "normal",
  holo: "holo",
  reverse: "reverse-holo",
};

/**
 * TCGdex' `foil` on a variant, in this app's words.
 *
 * The two ball prints land in `finish`, not in `foilPattern`: Cardmarket prices them apart, and
 * FINISHES is the column that picks a price series (see collection-row.ts). A foil this app has
 * no word for — `league` is one — leaves the printing in its plain finish with no pattern, which
 * is true: the printing exists, and what its foil is called is not something we can record.
 */
const PATTERN_OF: Record<string, FoilPattern> = { cosmos: "cosmos" };
const BALL_OF: Record<string, Finish> = { pokeball: "poke-ball", masterball: "master-ball" };
/**
 * TCGdex's foil for a reverse TCGplayer sells as an Energy Symbol reverse. Only read beside
 * TCGplayer's list: the ex era's reverses (ex5, ex6) carry the same word and are plain reverses
 * here, as they always were.
 */
const ENERGY_FOIL = "energy";

export type TcgVariant = { type?: string; foil?: string; stamp?: string[] };

/** One patterned reverse TCGplayer sells as a product of its own: "Eevee (Poke Ball Pattern)". */
export type FinishPrint = {
  finish: Extract<Finish, "poke-ball" | "master-ball" | "energy-symbol">;
  /** TCGplayer's product for the print. */
  productId: number;
  /** The printing its figure is filed under in tcgplayer_prices ("holofoil", "reverse-holofoil"). */
  printing: string;
};

/** The finishes a TCGplayer product can prove, and the only ones read from its list. */
const FINISH_PRINT_FINISHES: readonly string[] = ["poke-ball", "master-ball", "energy-symbol"];

/**
 * The printings a card has, deduped, in FINISHES order.
 *
 * A stamped variant (`stamp: ["gamestop"]`) is not a printing of its own here: it is the same
 * finish with a shop's mark on it, and this app does not record the mark. Dropping the stamp
 * rather than the variant keeps the finish it proves.
 */
export function printingsOf(
  variants: TcgVariant[] | null | undefined,
  /**
   * The English card's id, for TCGplayer's patterned reverses (finishPrintsFor). Left out (a
   * Japanese card, whose products are on another shelf), TCGdex's word stands for them.
   */
  tcgId?: string | null,
): Printing[] {
  const seen = new Map<string, Printing>();
  const sold = tcgId ? finishPrintsFor(tcgId) : null;
  for (const v of variants ?? []) {
    const base = FINISH_OF[v.type ?? ""];
    if (!base) continue;
    const foil = (v.foil ?? "").toLowerCase();
    const ball = BALL_OF[foil];
    /* With TCGplayer's list in hand the balls and the Energy Symbol reverse come from it alone: a
       ball TCGdex names and TCGplayer does not sell is not offered, and TCGdex's energy foil is
       the Energy Symbol reverse where TCGplayer sells one (added below) and a plain reverse where
       it does not. */
    if (sold && base === "reverse-holo" && ball) continue;
    if (sold && base === "reverse-holo" && foil === ENERGY_FOIL) {
      if (sold.some((p) => p.finish === "energy-symbol")) continue;
    }
    const finish = ball && base === "reverse-holo" ? ball : base;
    const foilPattern = ball ? null : (PATTERN_OF[foil] ?? null);
    seen.set(`${finish}|${foilPattern ?? ""}`, { finish, foilPattern });
  }
  /* Only beside an answer: an empty list is the catalogue having none, and a form offers every
     finish then. A card TCGdex lists no variants for does not become "a Poké Ball reverse only". */
  if (seen.size)
    for (const p of sold ?? []) seen.set(`${p.finish}|`, { finish: p.finish, foilPattern: null });
  return [...seen.values()].sort(
    (a, b) =>
      FINISHES.indexOf(a.finish) - FINISHES.indexOf(b.finish) ||
      (a.foilPattern ?? "").localeCompare(b.foilPattern ?? ""),
  );
}

type TcgplayerLink = { productId?: number; variants?: string[]; shadowless?: unknown } | null;
const LINKS = TCGPLAYER_IDS as Record<string, TcgplayerLink>;

/**
 * The cards TCGplayer prices a Shadowless run for, as tcgplayer-links.mjs linked them: all 102 of
 * Base Set, Machamp's from Deck Exclusives. It was Cardmarket's list until 2026-09-12. A run is
 * offered where the market the app prices from has a figure for it.
 */
const SHADOWLESS = new Set(Object.entries(LINKS).flatMap(([id, v]) => (v?.shadowless ? [id] : [])));

const stamped = (variant: string): boolean => variant.startsWith("1st-edition");

/**
 * The print runs a copy of this card can be from, or null where nothing can say.
 *
 * TCGplayer first, because it names the run of every printing it sells: "1st Edition Holofoil",
 * "Unlimited Holofoil", or a plain "Holofoil" on a card that had one run. TCGdex says whether a
 * stamped run exists and not whether an unstamped one does, and on Base Set Machamp that is the
 * wrong way round: every Machamp came in the two-player starter, stamped, and TCGdex lists an
 * unlimited variant all the same. TCGplayer sells it as 1st Edition only, so a form offered
 * "Unlimited" for a card that was never printed without the stamp (Bart, 2026-09-13).
 *
 * So: a stamped run where either source names one; an unstamped run where TCGplayer lists any
 * printing without the stamp, and assumed where TCGplayer has no link to read (every card was
 * printed at least once, and nearly all of them unstamped). Shadowless is Base Set's middle run,
 * where TCGplayer has a product for it.
 *
 * Null where neither source said anything about a stamped run, which is the rule the printings
 * follow: no answer is not "none exist", and a client offers every run then.
 */
export function editionsOf(
  tcgId: string,
  firstEdition: boolean | null | undefined,
): Edition[] | null {
  const variants = LINKS[tcgId]?.variants ?? [];
  const listed = variants.length > 0;
  if (firstEdition == null && !variants.some(stamped)) return null;
  const runs: Edition[] = [];
  if (!listed || variants.some((v) => !stamped(v))) runs.push("unlimited");
  if (firstEdition || variants.some(stamped)) runs.push("1st-edition");
  if (SHADOWLESS.has(tcgId)) runs.push("shadowless");
  return EDITIONS.filter((e) => runs.includes(e));
}

/**
 * The TCGdex series whose holos had one foil each, set by set, and nothing to choose.
 *
 * Wizards of the Coast's sets used their era's pattern on every holo: Starlight in Base, Jungle
 * and Fossil, Cosmos from Base Set 2 on (Bulbapedia, "Holofoil"). The patterns a copy records are
 * the exceptions later products brought: cracked ice in theme decks from Platinum, cosmos on
 * blister promos after Black & White, confetti at McDonald's. None of those were printed on a
 * Wizards card, so asking which one a Base Set Machamp has offers five answers that are all wrong.
 */
const ONE_FOIL_SERIES = new Set(["base", "gym", "neo", "lc", "ecard"]);

/**
 * The foil patterns a card of this series can be recorded with: none for a Wizards series, and
 * null (no answer, everything the printings allow) for every other.
 */
export const foilPatternsOfSerie = (serieId: string | null | undefined): FoilPattern[] | null =>
  serieId && ONE_FOIL_SERIES.has(serieId) ? [] : null;

/** One pattern print of a card TCGplayer sells as a product of its own: "Machamp 068/165 (Cosmos Holo)". */
export type PatternPrint = {
  foilPattern: FoilPattern;
  finish: Finish;
  /** TCGplayer's product for the print. */
  productId: number;
  /** The printing its price is filed under in tcgplayer_prices ("holofoil"). */
  printing: string;
};

/**
 * The pattern prints of a card and whether a print without a pattern exists beside them.
 *
 * `standard` is false only for a card whose own TCGplayer product is a pattern print with no plain
 * product beside it (the Tinkatink promo, svp-025, was only ever the cosmos holo).
 */
export type PatternPrints = { standard: boolean; prints: PatternPrint[] };

type StoredPatterns = {
  standard?: boolean;
  prints: { foilPattern: string; finish: string; productId: number; printing: string }[];
  finishPrints?: { finish: string; productId: number; printing: string }[];
};
const PATTERNS = TCGPLAYER_PATTERNS as Record<string, StoredPatterns>;

/**
 * Which foil patterns a copy of this card can really have, from TCGplayer's products
 * (scripts/tcgplayer-patterns.mjs, the rules in foil-pattern-products.mjs).
 *
 * Bart, 2026-09-14: a pattern is picked for you, not asked. Every holo offered all five patterns,
 * because TCGdex names the foil on a fraction of its cards. TCGplayer sells each pattern print as a
 * product of its own, so a card with none listed has none: `prints` is empty and a form asks nothing.
 *
 * Null where the card has no TCGplayer product at all, which is no answer, not "none".
 */
export function patternPrintsFor(tcgId: string): PatternPrints | null {
  if (LINKS[tcgId]?.productId == null) return null;
  const stored = PATTERNS[tcgId];
  const prints = (stored?.prints ?? []).flatMap((p) =>
    isFoilPattern(p.foilPattern) && (FINISHES as readonly string[]).includes(p.finish)
      ? [{ ...p, foilPattern: p.foilPattern, finish: p.finish as Finish }]
      : [],
  );
  return { standard: stored?.standard !== false, prints };
}

/**
 * The Poké Ball, Master Ball and Energy Symbol reverses TCGplayer sells of this card, each a
 * product of its own with its own price (scripts/tcgplayer-patterns.mjs, the rules in
 * foil-pattern-products.mjs). A form offers these finishes from here and not from TCGdex, and the
 * price job files each one's figure under the card as `${finish}-reverse-holofoil`
 * (finishPrintingKey).
 *
 * Null where the card has no TCGplayer product at all: no answer, and TCGdex's word stands.
 */
export function finishPrintsFor(tcgId: string): FinishPrint[] | null {
  if (LINKS[tcgId]?.productId == null) return null;
  return (PATTERNS[tcgId]?.finishPrints ?? []).flatMap((p) =>
    FINISH_PRINT_FINISHES.includes(p.finish)
      ? [{ ...p, finish: p.finish as FinishPrint["finish"] }]
      : [],
  );
}

/** Every English card's patterned reverses, for the price job and its tests. */
export const allFinishPrints = (): Record<string, FinishPrint[]> =>
  Object.fromEntries(
    Object.keys(PATTERNS).flatMap((id) => {
      const prints = finishPrintsFor(id);
      return prints?.length ? [[id, prints]] : [];
    }),
  );
