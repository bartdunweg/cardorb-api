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

/** The eight columns the database actually has, as the form sees them. */
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
 */
export const MAX = { name: 200, number: 40, option: 120, types: 10 };

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
 * So it moved to where it is true — cardProperties() in lib/storage/notion.ts,
 * which is the only code that has to care. Postgres takes the name as given.
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
  } = (body ?? {}) as Record<string, unknown>;

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
  };

  if (!draft.name) return { kind: "invalid", error: "A card needs a name." };
  if (!draft.set) return { kind: "invalid", error: "A card needs a set." };
  if (draft.name.length > MAX.name) return { kind: "invalid", error: "That name is too long." };
  if (draft.number.length > MAX.number)
    return { kind: "invalid", error: "That number is too long." };
  for (const value of [draft.set, draft.rarity, draft.gen, ...draft.types]) {
    if (value.length > MAX.option) return { kind: "invalid", error: "That value is too long." };
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
  };
}
