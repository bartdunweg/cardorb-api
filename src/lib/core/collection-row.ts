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
 * Three values and not more: this is the distinction Cardmarket prices, which
 * publishes one plain set of figures and one `-holo` set per product. "holo"
 * covers the older Holo Rare and "reverse-holo" the modern reverse — they share
 * a price, so they share a lookup, but they are different things to own and a
 * collector would not thank us for merging them into "foil".
 */
export const FINISHES = ["normal", "reverse-holo", "holo"] as const;
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
   * Which printing this copy is: "normal", "reverse-holo", "holo", or null.
   *
   * Null is "nobody has said", not "normal", and the two are kept apart on
   * purpose — see the 20260816200000 migration. It is priced as normal either
   * way; what null buys is that a later import can fill blanks without
   * overwriting a judgement somebody made.
   *
   * This used to live in `rarity`, which the ADR-0030 backfill replaced with
   * TCGdex's vocabulary. That vocabulary describes the card; this describes the
   * copy, and the two were never the same question.
   */
  finish: Finish | null;
  /**
   * The nine — not eight — inventory facts added for per-printing detail
   * (2026-08-14 card-inventory-fields migration): quantity 1, isFavorite
   * false, the rest null by default. See
   * docs/decisions/0006-per-variant-inventory-fields.md.
   */
  quantity: number;
  condition: string | null;
  grade: string | null;
  purchasePrice: number | null;
  /** ISO date (no time — a purchase is a day, not a moment). */
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
};

/**
 * The tag on the store's own fetch, where the store is something Next can cache
 * by fetching — which today means Notion and tomorrow means nothing.
 *
 * It used to be "cards-notion" and live in cards.ts, which was two things this
 * file fixes: the name was about the store rather than about what is stored,
 * and it sat in the module that is meant not to know which store it is.
 */
export const CARDS_TAG = "collection-rows";

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

/** The columns the database actually has, as the form sees them. */
export type CardDraft = {
  name: string;
  number: string;
  set: string;
  rarity: string;
  gen: string;
  types: string[];
  /** In the binder rather than on the wishlist. */
  collection: boolean;
  /** Kept out of the "latest pull" on bartdunweg.com. */
  excluded: boolean;
  /** Which printing this copy is, or null where the person adding it did not say. */
  finish: Finish | null;
  quantity: number;
  condition: string | null;
  grade: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
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
    collection = true,
    excluded = false,
    finish = null,
    quantity = 1,
    condition = null,
    grade = null,
    purchasePrice = null,
    purchaseDate = null,
    notes = null,
    isFavorite = false,
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
    collection: collection !== false,
    excluded: excluded === true,
    // Anything that is not one of the three is "not recorded" rather than an
    // error: this arrives from a form, an import and a future Notion sync, and
    // refusing a card because its finish was spelled oddly would lose the card
    // to save a field that is allowed to be empty.
    finish: isFinish(finish) ? finish : null,
    quantity: Number.isFinite(Number(quantity)) ? Math.trunc(Number(quantity)) : 1,
    condition: optionalText(condition),
    grade: optionalText(grade),
    purchasePrice:
      purchasePrice === null || purchasePrice === undefined || purchasePrice === ""
        ? null
        : Number(purchasePrice),
    purchaseDate: optionalText(purchaseDate),
    notes: optionalText(notes),
    isFavorite: isFavorite === true,
  };

  if (!draft.name) return { kind: "invalid", error: "A card needs a name." };
  if (!draft.set) return { kind: "invalid", error: "A card needs a set." };
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
export function rowFromDraft(draft: CardDraft): Omit<CollectionRow, "id" | "acquiredAt"> {
  return {
    name: draft.name,
    number: draft.number,
    setName: draft.set,
    rarity: draft.rarity || null,
    gen: draft.gen || null,
    types: draft.types,
    owned: draft.collection,
    excluded: draft.excluded,
    finish: draft.finish,
    quantity: draft.quantity,
    condition: draft.condition,
    grade: draft.grade,
    purchasePrice: draft.purchasePrice,
    purchaseDate: draft.purchaseDate,
    notes: draft.notes,
    isFavorite: draft.isFavorite,
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
  quantity: number;
  condition: string | null;
  grade: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
}>;

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

  if (!Object.keys(patch).length) return { kind: "invalid", error: "Nothing to change." };
  return { kind: "ok", patch };
}
