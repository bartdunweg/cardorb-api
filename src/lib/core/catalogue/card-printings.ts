import { EDITIONS, FINISHES, isFoilPattern } from "../collection/collection-row";
import { PATTERNED_REVERSES } from "../price-basis.mjs";
import type { Edition, Finish, FoilPattern } from "../collection/collection-row";
import TCGPLAYER_IDS from "../tcgplayer-ids.generated.json";
import TCGPLAYER_PATTERNS from "../tcgplayer-patterns.generated.json";
import REVERSE_HOLO from "../reverse-holo.generated.json";
import EXTRA_CARDS from "./extra-cards.json";

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
const BALL_OF: Record<string, Finish> = {
  pokeball: "poke-ball",
  masterball: "master-ball",
  friendball: "friend-ball",
  loveball: "love-ball",
  quickball: "quick-ball",
  duskball: "dusk-ball",
  "team-rocket": "team-rocket",
};
/**
 * TCGdex's foil for a reverse TCGplayer sells as an Energy Symbol reverse. Only read beside
 * TCGplayer's list: the ex era's reverses (ex5, ex6) carry the same word and are plain reverses
 * here, as they always were.
 */
const ENERGY_FOIL = "energy";

export type TcgVariant = { type?: string; foil?: string; stamp?: string[] };

/** One patterned reverse TCGplayer sells as a product of its own: "Eevee (Poke Ball Pattern)". */
export type FinishPrint = {
  finish: (typeof PATTERNED_REVERSES)[number];
  /** TCGplayer's product for the print. */
  productId: number;
  /** The printing its figure is filed under in tcgplayer_prices ("holofoil", "reverse-holofoil"). */
  printing: string;
};

/** The finishes a TCGplayer product can prove, and the only ones read from its list. */
const FINISH_PRINT_FINISHES: readonly string[] = PATTERNED_REVERSES;

/**
 * The printings a card has, deduped, in FINISHES order.
 *
 * A stamped variant (`stamp: ["gamestop"]`) is not a printing of its own here: it is the same
 * finish with a shop's mark on it, and this app does not record the mark. Dropping the stamp
 * rather than the variant keeps the finish it proves.
 *
 * Whether a plain reverse exists is decided from evidence, not from one source (reverseHoloExists):
 * TCGdex, TCGplayer and Scrydex per card, Bulbapedia's set rule where they tie. That decision adds a
 * plain reverse TCGdex does not list (every Black & White and XY card that has one) and takes away
 * one it lists wrongly (Expedition's basic Energy, Aquapolis's H cards), whether or not TCGplayer
 * prices it: a reverse nobody prices is offered and shows no price. A copy already recorded as one
 * keeps it (the forms keep a recorded finish in their options).
 */
export function printingsOf(
  variants: TcgVariant[] | null | undefined,
  /**
   * The English card's id, for TCGplayer's patterned reverses (finishPrintsFor). Left out (a
   * Japanese card, whose products are on another shelf), TCGdex's word stands for them.
   */
  tcgId?: string | null,
): Printing[] {
  /* A card TCGdex lists no variants for, that is one TCGplayer product of its own
     (extra-cards.json): the league and championship prints, sold as a reverse holo only; the
     alternate prints, as a holo; a trainer kit's energies, plain. That product's printings are the
     card's, and nothing else decides them: until 2026-09-15 a form offered every finish for these
     91 cards. */
  if (!variants?.length && tcgId && FROM_PRODUCT.has(tcgId)) {
    const own = productPrintingsOf(tcgId);
    if (own.length) return own;
  }
  const seen = new Map<string, Printing>();
  const sold = tcgId ? finishPrintsFor(tcgId) : null;
  const holoNotReverse = tcgId ? HOLO_BEFORE_REVERSES.has(tcgId) : false;
  const holoNotNormal = tcgId ? HOLO_NOT_NORMAL.has(tcgId) : false;
  const holoBeside = tcgId ? HOLO_BESIDE_NORMAL.has(tcgId) : false;
  for (const v of variants ?? []) {
    /* A card sold before reverse holos existed (Southern Islands, Wizards promos to May 2002) whose
       foil print TCGdex files as a reverse: it is the holo. And a holo TCGdex files as a normal
       (HOLO_NOT_NORMAL): the holo too. */
    const type =
      (holoNotReverse && v.type === "reverse" && !v.foil) || (holoNotNormal && v.type === "normal")
        ? "holo"
        : v.type;
    const base = FINISH_OF[type ?? ""];
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
    if (holoBeside && type === "normal") seen.set("holo|", { finish: "holo", foilPattern: null });
  }
  /* Only beside an answer: an empty list is the catalogue having none, and a form offers every
     finish then. A card TCGdex lists no variants for does not become "a Poké Ball reverse only". */
  if (seen.size)
    for (const p of sold ?? []) seen.set(`${p.finish}|`, { finish: p.finish, foilPattern: null });
  const reverse = tcgId ? reverseHoloExists(tcgId) : null;
  if (reverse === false || (reverse === null && tcgId && !pricesPlainReverse(tcgId)))
    seen.delete("reverse-holo|");
  if (reverse && seen.size)
    seen.set("reverse-holo|", { finish: "reverse-holo", foilPattern: null });
  if (tcgId && REVERSE_ONLY.has(tcgId) && seen.has("reverse-holo|"))
    for (const key of [...seen.keys()]) if (key !== "reverse-holo|") seen.delete(key);
  return [...seen.values()].sort(
    (a, b) =>
      FINISHES.indexOf(a.finish) - FINISHES.indexOf(b.finish) ||
      (a.foilPattern ?? "").localeCompare(b.foilPattern ?? ""),
  );
}

type TcgplayerLink = {
  productId?: number;
  variants?: string[];
  shadowless?: unknown;
  blueBorder?: unknown;
} | null;
const LINKS = TCGPLAYER_IDS as Record<string, TcgplayerLink>;

/**
 * English cards printed only as a reverse holo, where TCGdex lists another printing beside it.
 *
 * Bulbapedia names the one print and TCGplayer sells no other (2026-09-15): Thundurus BW41 and
 * Tornadus BW42 came in the Forces of Nature Collection, Lillipup BW52 in the Emerging Challenges
 * Box, all three "Mirror Parallel Holofoil"; Stormfront's Shiny Pokémon (SH1 to SH3) were Starlight
 * holos in Japan and reverse holos in English. TCGdex lists BW41, BW42 and BW52 as normal and the
 * SH cards as holo, so a form offered a Standard or a holo copy that was never printed.
 */
const REVERSE_ONLY = new Set(["bwp-BW41", "bwp-BW42", "bwp-BW52", "dp7-SH1", "dp7-SH2", "dp7-SH3"]);

/** The English cards this catalogue added from a TCGplayer product of their own (extra-cards.json). */
const FROM_PRODUCT = new Set(
  Object.entries((EXTRA_CARDS as { en?: Record<string, { product?: number }> }).en ?? {}).flatMap(
    ([id, card]) => (card.product ? [id] : []),
  ),
);

/** TCGplayer's printing names ("1st-edition-holofoil", "reverse-holofoil") as this app's finishes. */
const PRODUCT_FINISH: Record<string, Finish> = {
  normal: "normal",
  holofoil: "holo",
  "reverse-holofoil": "reverse-holo",
};

/** The printings a card's own TCGplayer product lists, where it lists any. */
function productPrintingsOf(tcgId: string): Printing[] {
  const finishes = new Set<Finish>();
  for (const v of LINKS[tcgId]?.variants ?? []) {
    const finish =
      PRODUCT_FINISH[
        v.replace(/^(1st-edition|unlimited)-/, "").replace(/^(1st-edition|unlimited)$/, "normal")
      ];
    if (finish) finishes.add(finish);
  }
  if (finishes.size) for (const p of finishPrintsFor(tcgId) ?? []) finishes.add(p.finish);
  return FINISHES.filter((f) => finishes.has(f)).map((finish) => ({ finish, foilPattern: null }));
}

const REVERSE_DECISIONS = (REVERSE_HOLO as { cards: Record<string, boolean> }).cards;
const HOLO_BEFORE_REVERSES = new Set(
  (REVERSE_HOLO as { holoBeforeReverses?: string[] }).holoBeforeReverses ?? [],
);
/**
 * Cards TCGdex lists as a plain printing that are holos: TCGplayer and Scrydex both name a holofoil
 * and no plain printing (scripts/reverse-holo-evidence.mjs). Most holo cards of Black & White, XY
 * and Sun & Moon, where TCGdex writes "normal" (Reshiram bw1-113, an Ultra Rare).
 */
const HOLO_NOT_NORMAL = new Set((REVERSE_HOLO as { holoNotNormal?: string[] }).holoNotNormal ?? []);
/**
 * Cards TCGdex lists as a plain printing only that have a holo beside it: TCGplayer and Scrydex both
 * name a holofoil, and one of them the plain card too (Emboar bw1-19, a Holo Rare whose plain print
 * came in a theme deck).
 */
const HOLO_BESIDE_NORMAL = new Set(
  (REVERSE_HOLO as { holoBesideNormal?: string[] }).holoBesideNormal ?? [],
);

/**
 * Whether a plain reverse holo of this English card exists, as scripts/reverse-holo-evidence.mjs
 * decided it: the majority of TCGdex's variants, TCGplayer's printings and Scrydex's variants that
 * answer for the card, and Bulbapedia's rule for its set where they tie (the witnesses and the rule per
 * set are in reverse-holo.generated.json). Null for a card the run did not see, a set released since.
 */
export const reverseHoloExists = (tcgId: string): boolean | null =>
  REVERSE_DECISIONS[tcgId] ?? null;

/**
 * Whether TCGplayer prices a plain reverse holo of this card: false only where its own product lists
 * printings and none of them is a reverse holofoil. No link, or a product with no printings listed,
 * is no answer and counts as yes. The rule for a card reverseHoloExists has no decision for.
 */
export function pricesPlainReverse(tcgId: string): boolean {
  const variants = LINKS[tcgId]?.variants ?? [];
  return !variants.length || variants.some((v) => v.endsWith("reverse-holofoil"));
}

/**
 * The cards TCGplayer prices a Shadowless run for, as tcgplayer-links.mjs linked them: all 102 of
 * Base Set, Machamp's from Deck Exclusives. It was Cardmarket's list until 2026-09-12. A run is
 * offered where the market the app prices from has a figure for it.
 */
const SHADOWLESS = new Set(Object.entries(LINKS).flatMap(([id, v]) => (v?.shadowless ? [id] : [])));

/**
 * The My First Battle cards TCGplayer sells a Blue Border print of, as tcgplayer-links.mjs linked
 * them: the four starters and the four basic energies.
 */
const BLUE_BORDER = new Set(
  Object.entries(LINKS).flatMap(([id, v]) => (v?.blueBorder ? [id] : [])),
);

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
  /* A Blue Border print is an answer about the runs on its own: no card that has one was stamped. */
  if (firstEdition == null && !variants.some(stamped) && !BLUE_BORDER.has(tcgId)) return null;
  const runs: Edition[] = [];
  if (!listed || variants.some((v) => !stamped(v))) runs.push("unlimited");
  if (firstEdition || variants.some(stamped)) runs.push("1st-edition");
  if (SHADOWLESS.has(tcgId)) runs.push("shadowless");
  if (BLUE_BORDER.has(tcgId)) runs.push("blue-border");
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
