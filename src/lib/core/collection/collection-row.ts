/**
 * One printing, as any store hands it over — and the line this project is cut
 * along.
 *
 * Above the line, cards.ts has two years of matching a hand-kept list against
 * three catalogues and does not know or care where the list came from. Below it,
 * an adapter turns rows in a table, or pages in somebody's Notion database, into
 * these.
 *
 * The seam was chosen where the old code already had a natural join rather than
 * where a diagram would put one: Notion property bags went in at
 * fetchOwnedRows() and came out grouped by set name a few hundred lines later,
 * and everything in between was strings. So this is that middle, written down.
 * Everything that made the collection worth having — numberForms, SET_ALIASES,
 * the subset resolution, sameCard — sits above the line and does not move.
 */

/**
 * Which printing a copy is.
 *
 * Three kinds and not more: this is the distinction Cardmarket prices, which
 * publishes one plain set of figures and one `-holo` set per product. "holo"
 * covers the older Holo Rare and "reverse-holo" the modern reverse — they share
 * a price, so they share a lookup, but they are different things to own and a
 * collector would not thank us for merging them into "foil".
 */
/**
 * Whether a string could be a catalogue card id. Defined beside the catalogues
 * that use one (tcgdex-language.ts) rather than here, so the shape a URL is
 * built from and the shape a request is checked against are one definition.
 */
import { isTcgId } from "../catalogue/tcgdex-language";

/** A folder id, as Postgres writes one. Checked before it reaches the store. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FINISHES = ["normal", "reverse-holo", "holo", "poke-ball", "master-ball"] as const;
/**
 * The finishes that are a reverse holo with a pattern on it — the Poké Ball and Master Ball
 * printings of 151 and Prismatic Evolutions. They read the foil price fields as a reverse does.
 *
 * Defined in ../price-basis.mjs and re-exported here, where callers look for it. It is a rule
 * about which price series a copy reads, and the one other thing that has to obey it —
 * scripts/snapshot-collection-value.mjs — runs on plain node and cannot import this file. It
 * kept its own copy of the rule and the copy drifted; see the function's own comment.
 */
export { isReverseFinish } from "../price-basis.mjs";

/**
 * What the foil on a copy looks like, which is not what it is worth.
 *
 * FINISHES answers the money question — which of Cardmarket's two price series a copy reads —
 * and holds five values rather than three only because the Poké Ball and Master Ball prints are
 * patterns Cardmarket happens to price apart. Every pattern below has no price of its own: a
 * Cosmos Holo Rare and a plain Holo Rare of one card are the same product and the same figure.
 * Putting them in FINISHES would mean picking a price series for each, and the value history is
 * built on that column.
 *
 * The ball patterns are deliberately not repeated here. `finish` already carries them, and one
 * fact in two columns is a fact that drifts.
 *
 * These five are what a real export names. It is a list to grow, not a taxonomy: a pattern
 * nothing can tell us about is a pattern nobody can record.
 */
export const FOIL_PATTERNS = [
  "cosmos",
  "cracked-ice",
  "starlight",
  "confetti",
  "vertical-line",
] as const;
export type FoilPattern = (typeof FOIL_PATTERNS)[number];

export const isFoilPattern = (v: unknown): v is FoilPattern =>
  typeof v === "string" && (FOIL_PATTERNS as readonly string[]).includes(v);

/** The languages a card is printed in, as Cardmarket and TCGdex code them. */
/**
 * `zh-tw` and `zh-cn` beside `zh`: Chinese is two catalogues, traditional and simplified, and
 * the shelves name them apart. `zh` stays for the rows that carry it and reads as "one of the
 * two" — both are asked, the first that has the card answers (cataloguesFor). A card added from
 * a Chinese shelf used to arrive as `zh-tw`, fail this list, and be stored with no language at
 * all, after which it was looked up as an English card by its set's name (2026-09-11).
 */
export const LANGUAGES = [
  "en",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "nl",
  "ja",
  "ko",
  "zh",
  "zh-tw",
  "zh-cn",
] as const;
export type Language = (typeof LANGUAGES)[number];
export const isLanguage = (v: unknown): v is Language =>
  typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
export type Finish = (typeof FINISHES)[number];

export const isFinish = (v: unknown): v is Finish =>
  typeof v === "string" && (FINISHES as readonly string[]).includes(v);

/**
 * The eight facts about a card that are actually somebody's.
 *
 * Worth saying how short this list is, because it is the whole argument for the
 * migration being smaller than it looks. Everything else an OwnedCard carries —
 * the scan, the price, the TCGdex id, the species, the set's logo and release
 * date — is a fact about the card rather than about its owner, identical for
 * everyone who holds the same printing, and fetched rather than stored.
 */
export type CollectionRow = {
  /** The store's own id, or null for a row that has not been written yet. */
  id: string | null;
  name: string;
  /** As it is written down, usually zero-padded ("088"). */
  number: string;
  setName: string;
  rarity: string | null;
  gen: string | null;
  types: string[];
  /**
   * The catalogue's own id for this printing, where whoever wrote the row knew
   * it. `cards.tcg_id`.
   *
   * For an English row it is a note: the card is found the way it always was,
   * by number within the set the name resolves to, and nothing here reads this.
   * For a row in one of the four languages with a catalogue of its own it is
   * the whole address — see tcgdex-language.ts, and resolveSetFacts(), which
   * has no other way to find a Japanese card because a Japanese set has no
   * English name to look up.
   */
  tcgId: string | null;
  /**
   * In the binder rather than on the wishlist. Notion's Collection checkbox,
   * where a missing value meant owned — which is why every store below has to
   * default this to true rather than to false.
   */
  owned: boolean;
  /**
   * Kept out of the "latest pull" on bartdunweg.com. Written here, never read
   * here: the portfolio is the only thing that has ever cared about it, and a
   * column dropped because the app writing it does not read it is how another
   * project breaks quietly.
   */
  excluded: boolean;
  /**
   * When this printing joined the collection, ISO, or null where the store does
   * not know. Notion's created_time.
   *
   * Not "when this row was written". A card entered today may have been pulled
   * in 2019, and scripts/snapshot-collection-value.mjs is built entirely on
   * knowing the difference.
   */
  acquiredAt: string | null;
  /**
   * Which printing this copy is: "normal", "reverse-holo", "holo", "poke-ball",
   * "master-ball", or null.
   *
   * Null is "nobody has said", not "normal", and the two are kept apart on
   * purpose — see the 20260816200000 migration. It is priced as normal either
   * way; what null buys is that a later import can fill blanks without
   * overwriting a judgement somebody made.
   *
   * This used to live in `rarity`, which the catalogue backfill replaced with
   * TCGdex's vocabulary. That vocabulary describes the card; this describes the
   * copy, and the two were never the same question.
   */
  finish: Finish | null;
  /** What the foil looks like, where a source said. Null is "not recorded", never "plain". */
  foilPattern: FoilPattern | null;
  /**
   * The nine — not eight — inventory facts added for per-printing detail
   * (2026-08-14 card-inventory-fields migration): quantity 1, isFavorite
   * false, the rest null by default. See
   * git history.
   */
  quantity: number;
  condition: string | null;
  grade: string | null;
  /** Two-letter code from LANGUAGES, or null for "not recorded" (read as English). */
  language: Language | null;
  purchasePrice: number | null;
  /** ISO date (no time — a purchase is a day, not a moment). */
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  /** The folder this copy is filed in (`/v1/folders`), or null for none. */
  collectionId: string | null;
};

/**
 * The tag on one person's rows, shared by the reader and the writer so the two
 * cannot name it differently.
 *
 * A function of the user rather than a constant, and that is the whole point:
 * a single tag would mean one person adding a card drops everybody's cache, so
 * the cost of a busy account is paid by every quiet one. It takes a userId
 * today that is always the same string (see OWNER in ./collection.ts), which
 * costs nothing and means the shape does not have to change later.
 */
export const cardsTag = (userId: string) => `cards:${userId}`;
/** The folder list, apart from the cards: a rule edit must not drop the assembled collection. */
export const foldersTag = (userId: string) => `folders:${userId}`;

/** The columns the database actually has, as the form sees them. */
export type CardDraft = {
  name: string;
  number: string;
  set: string;
  rarity: string;
  gen: string;
  types: string[];
  /**
   * The catalogue's id for the card being added, where the client picked it off
   * a shelf rather than typing it. See CollectionRow.tcgId: for a Japanese,
   * Korean or Chinese card it is the only thing that finds the card again.
   * Refused when it is present and not an id, rather than blanked — a wrong one
   * costs the card its picture and its price, silently.
   */
  tcgId: string | null;
  /** In the binder rather than on the wishlist. */
  collection: boolean;
  /** Kept out of the "latest pull" on bartdunweg.com. */
  excluded: boolean;
  /** Which printing this copy is, or null where the person adding it did not say. */
  finish: Finish | null;
  /** What the foil looks like, where a source said. Null is "not recorded", never "plain". */
  foilPattern: FoilPattern | null;
  quantity: number;
  condition: string | null;
  grade: string | null;
  /** Two-letter code from LANGUAGES, or null for "not recorded" (read as English). */
  language: Language | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  /** A folder of the caller's, filled by hand, to file the new card in at once. */
  collectionId: string | null;
  /**
   * When the copy was pulled, where the caller knows. Left out — which is every
   * card added by hand — the column default stands, and that is the point:
   * you are adding it because you just pulled it. A restore is the one create
   * that knows better, because the row it puts back already had a date.
   */
  acquiredAt?: string;
};

/**
 * What each select currently offers, so the form is built from the collection
 * rather than from a list written down beside it. A set that ships tomorrow
 * shows up in the form the moment a card from it exists, and a renamed rarity
 * does not leave the form offering the old name.
 */
export type CardFields = {
  sets: string[];
  rarities: string[];
  gens: string[];
  types: string[];
};

/**
 * Length caps.
 *
 * They were "well under Notion's own 2000 characters for a text property",
 * which was true and is about to stop being the reason. The Postgres schema in
 * the accounts migration declares the same numbers as check constraints, and
 * from there the rule is that these two have to agree: validation that is more
 * generous than the column turns a valid-looking form into a 500 from a
 * constraint, which is the least useful error this app could produce.
 *
 * A card called anything near this is a paste accident, not a card.
 *
 * `conditionOrGrade` and `notes` match the check constraints the inventory
 * migration put on condition/grade (40) and notes (2000) — the same
 * must-agree rule as the rest of this list.
 */
export const MAX = {
  name: 200,
  number: 40,
  option: 120,
  types: 10,
  conditionOrGrade: 40,
  notes: 2000,
};

export type AcquiredAtValidation = { kind: "invalid"; error: string } | { kind: "ok"; at: string };

/**
 * The one reading of `acquiredAt`, for every body that carries one: the patch,
 * a copy, and a create that is putting a removed row back.
 *
 * A day's slack on "not in the future" rather than none, because the date is a
 * day somebody picked in their own zone and a card pulled this evening in
 * Auckland is already tomorrow to a server in Frankfurt. Further ahead than
 * that is a typo or a wrong clock, and it would sort the collection wrong for
 * as long as it took anybody to notice.
 */
export function readAcquiredAt(value: unknown): AcquiredAtValidation {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  if (Number.isNaN(at) || at > Date.now() + 86_400_000)
    return { kind: "invalid", error: "acquiredAt must be a date, not in the future." };
  return { kind: "ok", at: new Date(at).toISOString() };
}

/**
 * One line, whatever arrived.
 *
 * There used to be a second cleaner beside this one that also stripped commas,
 * applied to the four select-shaped fields, because *Notion* splits a select
 * option on a comma. That is a fact about Notion and it had no business being a
 * rule about what a card may be called: it meant a set genuinely named
 * "Sun & Moon, Promos" could not be typed in, in an app that might never write
 * to Notion again.
 *
 * That rule left with the code that needed it, when Notion did. Postgres
 * takes the name as given.
 */
const cleanText = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export type CardValidation = { kind: "invalid"; error: string } | { kind: "ok"; draft: CardDraft };

/**
 * The body of a POST, checked before anything is created.
 *
 * Name and Set are the two required ones, and that is not politeness about
 * completeness: the grouping in cards.ts skips any row missing either, so a
 * card added without them would be written and then be invisible on the page it
 * was added from, which reads as the form having failed.
 *
 * The select values are not checked against the options that exist. A store
 * creates an option it has not seen, and that is the only way a set released
 * this morning gets a row at all. The form offers the existing ones so the
 * normal path is a pick rather than a spelling.
 */
export function validateCardDraft(body: unknown): CardValidation {
  const {
    name = "",
    number = "",
    set = "",
    rarity = "",
    gen = "",
    types = [],
    tcgId = null,
    collection = true,
    excluded = false,
    finish = null,
    foilPattern = null,
    quantity = 1,
    condition = null,
    grade = null,
    language = null,
    purchasePrice = null,
    purchaseDate = null,
    notes = null,
    isFavorite = false,
    collectionId = null,
    acquiredAt,
  } = (body ?? {}) as Record<string, unknown>;

  const optionalText = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const cleaned = cleanText(String(value));
    return cleaned || null;
  };

  const draft: CardDraft = {
    name: cleanText(String(name)),
    number: cleanText(String(number)),
    set: cleanText(String(set)),
    rarity: cleanText(String(rarity)),
    gen: cleanText(String(gen)),
    types: (Array.isArray(types) ? types : [])
      .map((t) => cleanText(String(t)))
      .filter(Boolean)
      .slice(0, MAX.types),
    tcgId: isTcgId(tcgId) ? tcgId : null,
    collection: collection !== false,
    excluded: excluded === true,
    // null and undefined are both "nobody has said". Anything else that is not
    // one of the three is refused below, the same rule and sentence as
    // validateCardPatch(): this used to become null so an import would not
    // lose the card, but no import sends a finish (csv.ts writes null itself)
    // and a form or an app that misspells one should be told, not blanked.
    finish: isFinish(finish) ? finish : null,
    // Unrecognised reads as "not recorded" rather than being refused, unlike
    // finish: a pattern costs nothing when it is wrong or absent — it buys no
    // price and no placement — and the list is one somebody else's vocabulary
    // gets mapped onto, so it will be short of a name before it is wrong.
    foilPattern: isFoilPattern(foilPattern) ? foilPattern : null,
    quantity: Number.isFinite(Number(quantity)) ? Math.trunc(Number(quantity)) : 1,
    condition: optionalText(condition),
    grade: optionalText(grade),
    language: isLanguage(language) ? language : null,
    purchasePrice:
      purchasePrice === null || purchasePrice === undefined || purchasePrice === ""
        ? null
        : Number(purchasePrice),
    purchaseDate: optionalText(purchaseDate),
    notes: optionalText(notes),
    isFavorite: isFavorite === true,
    collectionId: typeof collectionId === "string" && UUID.test(collectionId) ? collectionId : null,
  };

  if (!draft.name) return { kind: "invalid", error: "A card needs a name." };
  if (!draft.set) return { kind: "invalid", error: "A card needs a set." };
  if (finish !== null && finish !== undefined && !isFinish(finish)) {
    return { kind: "invalid", error: `finish must be null, ${FINISHES.join(", ")}.` };
  }
  // Told rather than blanked, unlike foilPattern: a foil nobody named costs
  // nothing, and a card id nobody can parse costs a Japanese card its picture,
  // its rarity and its price with no sign that anything went wrong.
  if (tcgId !== null && tcgId !== undefined && !isTcgId(tcgId)) {
    return { kind: "invalid", error: "tcgId must be a catalogue card id, like sv03-125." };
  }
  if (draft.name.length > MAX.name) return { kind: "invalid", error: "That name is too long." };
  if (draft.number.length > MAX.number)
    return { kind: "invalid", error: "That number is too long." };
  for (const value of [draft.set, draft.rarity, draft.gen, ...draft.types]) {
    if (value.length > MAX.option) return { kind: "invalid", error: "That value is too long." };
  }
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1) {
    return { kind: "invalid", error: "Quantity must be a whole number of at least 1." };
  }
  for (const value of [draft.condition, draft.grade]) {
    if (value && value.length > MAX.conditionOrGrade) {
      return { kind: "invalid", error: "That value is too long." };
    }
  }
  if (draft.notes && draft.notes.length > MAX.notes) {
    return { kind: "invalid", error: "That note is too long." };
  }
  if (
    draft.purchasePrice !== null &&
    (!Number.isFinite(draft.purchasePrice) || draft.purchasePrice < 0)
  ) {
    return { kind: "invalid", error: "That purchase price is not valid." };
  }
  if (draft.purchaseDate !== null && Number.isNaN(Date.parse(draft.purchaseDate))) {
    return { kind: "invalid", error: "That purchase date is not valid." };
  }
  // Absent, and null, which every optional field here reads as absent: the
  // column default stands and the card is pulled now. Present, it is read by
  // the same rule the PATCH is, so a restore cannot put a date in that an edit
  // would have refused.
  if (acquiredAt !== null && acquiredAt !== undefined) {
    const read = readAcquiredAt(acquiredAt);
    if (read.kind === "invalid") return read;
    draft.acquiredAt = read.at;
  }

  return { kind: "ok", draft };
}

/**
 * A validated draft as a row, for the stores that can take one directly.
 *
 * The two names differ on purpose and it is worth not tidying away: a draft is
 * what a form submitted, a row is what a collection holds. `set` becomes
 * `setName` because "set" alone reads as a verb in every call site, and the
 * empty strings become nulls because a rarity nobody filled in is absent rather
 * than blank.
 */
export function rowFromDraft(
  draft: CardDraft,
): Omit<CollectionRow, "id" | "acquiredAt"> & Partial<Pick<CollectionRow, "acquiredAt">> {
  return {
    name: draft.name,
    number: draft.number,
    setName: draft.set,
    rarity: draft.rarity || null,
    gen: draft.gen || null,
    types: draft.types,
    tcgId: draft.tcgId,
    owned: draft.collection,
    excluded: draft.excluded,
    finish: draft.finish,
    foilPattern: draft.foilPattern,
    quantity: draft.quantity,
    condition: draft.condition,
    grade: draft.grade,
    language: draft.language,
    purchasePrice: draft.purchasePrice,
    purchaseDate: draft.purchaseDate,
    notes: draft.notes,
    isFavorite: draft.isFavorite,
    collectionId: draft.collectionId,
    // The key is there or it is not — never there holding undefined. A store
    // that spreads this into an insert would write a null over the column
    // default, and "nobody said when" would become "no date", which is a
    // different thing and sorts last.
    ...(draft.acquiredAt ? { acquiredAt: draft.acquiredAt } : {}),
  };
}

/**
 * What a PATCH to one printing may change: the two facts that already existed
 * outside the draft (owned, excluded — moving a card between the binder and
 * the wishlist, or toggling the portfolio's own exclusion) plus the seven
 * inventory fields. Not name/number/set/rarity/gen/types: those identify
 * which printing this is, and changing them is closer to deleting one row and
 * creating another than to editing one.
 */
export type CardPatch = Partial<{
  owned: boolean;
  excluded: boolean;
  /** null clears it back to "not recorded", which is a thing somebody may mean. */
  finish: Finish | null;
  /** The same, for the foil's pattern. Its own field: see FOIL_PATTERNS. */
  foilPattern: FoilPattern | null;
  quantity: number;
  condition: string | null;
  grade: string | null;
  /** Two-letter code from LANGUAGES, or null for "not recorded" (read as English). */
  language: Language | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  /** null takes the copy out of its folder. */
  collectionId: string | null;
  /** When the copy was pulled: an ISO date or timestamp, not in the future. Decides Newest first. */
  acquiredAt: string;
}>;

/** How many rows one PATCH may name. A kind is rarely more than a handful of rows; a hundred is a script. */
export const MAX_ITEMS_PER_PATCH = 100;

export type ItemIdsValidation = { kind: "invalid"; error: string } | { kind: "ok"; ids: string[] };

/**
 * The `ids` of a PATCH on many rows: a list of one to MAX_ITEMS_PER_PATCH row ids, each a
 * UUID, none twice. Checked by hand like the patch beside it.
 */
export function validateItemIds(value: unknown): ItemIdsValidation {
  if (!Array.isArray(value) || value.length === 0)
    return { kind: "invalid", error: "ids must be a list of at least one row id." };
  if (value.length > MAX_ITEMS_PER_PATCH)
    return { kind: "invalid", error: `ids may name at most ${MAX_ITEMS_PER_PATCH} rows.` };
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !UUID.test(id))
      return { kind: "invalid", error: "Every id must be a row id." };
    if (ids.includes(id)) return { kind: "invalid", error: "ids names a row twice." };
    ids.push(id);
  }
  return { kind: "ok", ids };
}

export type CardPatchValidation =
  { kind: "invalid"; error: string } | { kind: "ok"; patch: CardPatch };

/**
 * The body of a PATCH, checked the same way a draft is: only the keys present
 * are touched (see postgres.ts's updateRow(), which builds its update from
 * exactly this object), so this only validates what was actually sent rather
 * than filling in defaults for fields the caller never mentioned.
 */
export function validateCardPatch(body: unknown): CardPatchValidation {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: CardPatch = {};

  // The three flags, checked the same way, in one place rather than three
  // copies of the same four lines. Not coerced: `"false"` and `0` are both
  // truthy-adjacent enough that a coercing check would silently invert them,
  // and a PATCH names the field it is changing, so a wrong type is worth
  // saying out loud.
  //
  // One thing did change when these three were gathered here, and it is small
  // enough to be worth writing down rather than discovering: this returns the
  // *first* error it finds, and `excluded` and `isFavorite` used to be checked
  // after `finish` and `quantity`. A body with two invalid fields at once is
  // now told about the flag rather than the finish. Every single-field answer
  // is identical, which is every answer a working client can produce.
  for (const key of ["owned", "excluded", "isFavorite"] as const) {
    if (key in b) {
      if (typeof b[key] !== "boolean")
        return { kind: "invalid", error: `${key} must be true or false.` };
      patch[key] = b[key];
    }
  }
  if ("finish" in b) {
    // null is allowed and meaningful: it puts the row back to "nobody has
    // said", which is not the same as calling it normal. Anything else that is
    // not one of the three is refused here, unlike on a draft — a PATCH is
    // somebody editing one field on purpose, so a typo should be told rather
    // than quietly turned into a blank.
    if (b.finish !== null && !isFinish(b.finish))
      return { kind: "invalid", error: `finish must be null, ${FINISHES.join(", ")}.` };
    patch.finish = b.finish as Finish | null;
  }
  if ("foilPattern" in b) {
    // Refused rather than blanked, the same reasoning as finish one block up:
    // one card can be held as a cosmos holo and as a plain one at the same
    // time, so this is somebody choosing between two copies they own and a
    // typo should be told.
    if (b.foilPattern !== null && !isFoilPattern(b.foilPattern))
      return { kind: "invalid", error: `foilPattern must be null, ${FOIL_PATTERNS.join(", ")}.` };
    patch.foilPattern = b.foilPattern as FoilPattern | null;
  }
  if ("quantity" in b) {
    const q = Number(b.quantity);
    if (!Number.isInteger(q) || q < 1) {
      return { kind: "invalid", error: "Quantity must be a whole number of at least 1." };
    }
    patch.quantity = q;
  }
  for (const key of ["condition", "grade"] as const) {
    if (key in b) {
      const value = b[key];
      if (value !== null && typeof value !== "string") {
        return { kind: "invalid", error: `${key} must be text or null.` };
      }
      const cleaned = value === null ? null : cleanText(value) || null;
      if (cleaned && cleaned.length > MAX.conditionOrGrade) {
        return { kind: "invalid", error: "That value is too long." };
      }
      patch[key] = cleaned;
    }
  }
  if ("language" in b) {
    if (b.language !== null && !isLanguage(b.language))
      return { kind: "invalid", error: `language must be null or one of ${LANGUAGES.join(", ")}.` };
    patch.language = b.language as Language | null;
  }
  if ("notes" in b) {
    const value = b.notes;
    if (value !== null && typeof value !== "string") {
      return { kind: "invalid", error: "notes must be text or null." };
    }
    const cleaned = value === null ? null : value.trim() || null;
    if (cleaned && cleaned.length > MAX.notes) {
      return { kind: "invalid", error: "That note is too long." };
    }
    patch.notes = cleaned;
  }
  if ("purchasePrice" in b) {
    const value = b.purchasePrice;
    if (value === null) {
      patch.purchasePrice = null;
    } else {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        return { kind: "invalid", error: "That purchase price is not valid." };
      }
      patch.purchasePrice = n;
    }
  }
  if ("acquiredAt" in b) {
    const read = readAcquiredAt(b.acquiredAt);
    if (read.kind === "invalid") return read;
    patch.acquiredAt = read.at;
  }
  if ("purchaseDate" in b) {
    const value = b.purchaseDate;
    if (value !== null && typeof value !== "string") {
      return { kind: "invalid", error: "purchaseDate must be a date string or null." };
    }
    if (value !== null && Number.isNaN(Date.parse(value))) {
      return { kind: "invalid", error: "That purchase date is not valid." };
    }
    patch.purchaseDate = value;
  }

  if ("collectionId" in b) {
    const value = b.collectionId;
    if (value !== null && !(typeof value === "string" && UUID.test(value))) {
      return { kind: "invalid", error: "collectionId must be a folder id or null." };
    }
    patch.collectionId = value as string | null;
  }

  if (!Object.keys(patch).length) return { kind: "invalid", error: "Nothing to change." };
  return { kind: "ok", patch };
}

/**
 * What a copy may differ in from the row it comes from: the inventory facts,
 * never the identity (that is another card) and never quantity, owned or the
 * star (those are the row's, or the copy's own count).
 */
export type CopyChanges = Pick<
  CardPatch,
  | "finish"
  | "foilPattern"
  | "condition"
  | "grade"
  | "language"
  | "purchasePrice"
  | "purchaseDate"
  | "notes"
  | "collectionId"
  | "acquiredAt"
>;

const COPY_KEYS = [
  "finish",
  "foilPattern",
  "condition",
  "grade",
  "language",
  "purchasePrice",
  "purchaseDate",
  "notes",
  "collectionId",
  "acquiredAt",
] as const;

export type CopyBodyValidation =
  { kind: "invalid"; error: string } | { kind: "ok"; count: number; changes: CopyChanges };

/**
 * The body of POST …/copies and …/split: `count` (default 1) and the changes.
 * `atLeastOne`: a split of identical copies is no split (raise or lower the
 * quantity instead); a new copy may be identical (it is one more of the same).
 */
export function validateCopyBody(body: unknown, atLeastOne: boolean): CopyBodyValidation {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { kind: "invalid", error: "Invalid request" };
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    if (key === "count") continue;
    if (!(COPY_KEYS as readonly string[]).includes(key))
      return {
        kind: "invalid",
        error: `${key} is not something a copy differs in. A copy keeps its card; change the row instead.`,
      };
  }
  let count = 1;
  if ("count" in b) {
    const n = b.count;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 999)
      return { kind: "invalid", error: "count must be a whole number from 1 to 999." };
    count = n;
  }
  const rest: Record<string, unknown> = { ...b };
  delete rest.count;
  // An empty body is a copy identical in every way; validateCardPatch() would call that nothing.
  let changes: CopyChanges = {};
  if (Object.keys(rest).length > 0) {
    const checked = validateCardPatch(rest);
    if (checked.kind === "invalid") return checked;
    changes = checked.patch as CopyChanges;
  }
  if (atLeastOne && Object.keys(changes).length === 0)
    return { kind: "invalid", error: "Same in every way: change the quantity instead." };
  return { kind: "ok", count, changes };
}
