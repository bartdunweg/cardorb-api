/**
 * Writing a row to the card database, which is the one thing this site does to
 * Notion rather than with it.
 *
 * Everything else here reads: lib/cards.ts walks the collection, lib/notion.ts
 * takes the newest row off it. This is the other direction, so it does not get
 * to fail soft. A read that fails renders an empty state and nobody loses
 * anything; a write that fails silently loses the card Bart just pulled. Every
 * failure below comes back as a message the form can show.
 *
 * Server-side only: it takes the token as an argument, but the only caller that
 * has one is app/api/cards/route.ts.
 */

import { NOTION_VERSION, TRADING_DATABASE, type NotionProperty } from "./notion";

/** The eight columns the database actually has, as the form sees them. */
export type CardDraft = {
  name: string;
  number: string;
  set: string;
  rarity: string;
  gen: string;
  types: string[];
  /** Notion's Collection checkbox: in the binder rather than on the wishlist. */
  collection: boolean;
  /** Notion's Excluded checkbox: kept out of the "latest pull" on /about. */
  excluded: boolean;
};

/**
 * What each select in the database currently offers, so the form can be built
 * from the database rather than from a list written down beside it. A set that
 * ships tomorrow shows up in the form the moment it exists in Notion, and a
 * renamed rarity does not leave the form offering the old name.
 */
export type CardFields = {
  sets: string[];
  rarities: string[];
  gens: string[];
  types: string[];
};

/**
 * Length caps, well under Notion's own 2000 characters for a text property.
 * A card called anything near this is a paste accident, not a card.
 */
export const MAX = { name: 200, number: 40, option: 120, types: 10 };

/** A select option cannot hold a comma: Notion splits on it. */
const cleanOption = (s: string) => s.replace(/[\r\n,]+/g, " ").trim();

const cleanText = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export type CardValidation = { kind: "invalid"; error: string } | { kind: "ok"; draft: CardDraft };

/**
 * The body of a POST, checked before anything is created.
 *
 * Name and Set are the two required ones, and that is not politeness about
 * completeness: walkCollection() in lib/cards.ts skips any row missing either,
 * so a card added without them would be written to Notion and then be invisible
 * on the page it was added from, which reads as the form having failed.
 *
 * The select values are not checked against the options that exist. Notion
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
    set: cleanOption(String(set)),
    rarity: cleanOption(String(rarity)),
    gen: cleanOption(String(gen)),
    types: (Array.isArray(types) ? types : [])
      .map((t) => cleanOption(String(t)))
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
 * A draft as Notion's property payload. An empty select is left out rather than
 * sent as null: both clear the column, and leaving it out means a column that
 * gets renamed or removed cannot fail a write that never mentioned it.
 */
export function cardProperties(draft: CardDraft): Record<string, NotionProperty> {
  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: draft.name } }] },
    Collection: { checkbox: draft.collection },
    Excluded: { checkbox: draft.excluded },
    Set: { select: { name: draft.set } },
  };
  if (draft.number) props.Number = { rich_text: [{ text: { content: draft.number } }] };
  if (draft.rarity) props.Rarity = { select: { name: draft.rarity } };
  if (draft.gen) props.Gen = { select: { name: draft.gen } };
  if (draft.types.length) props.Type = { multi_select: draft.types.map((name) => ({ name })) };
  return props as Record<string, NotionProperty>;
}

/** Notion's own message when it refuses, which is the only useful one there is. */
async function notionError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Creates the row. Returns the new page's id, or throws with a message meant to
 * be read by the one person who can act on it.
 *
 * `cache: "no-store"`, because this is a write: a POST is not cached by Next
 * anyway, but saying so keeps it out of any future default.
 */
export async function createCard(draft: CardDraft, token: string): Promise<string> {
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: TRADING_DATABASE },
      properties: cardProperties(draft),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await notionError(res, `Notion refused the card (${res.status}).`));
  }
  const page = (await res.json()) as { id?: string };
  return page.id ?? "";
}

type Schema = {
  properties?: Record<
    string,
    {
      type?: string;
      select?: { options?: { name?: string }[] };
      multi_select?: { options?: { name?: string }[] };
    }
  >;
};

const optionsOf = (schema: Schema, column: string): string[] => {
  const prop = schema.properties?.[column];
  const options = prop?.select?.options ?? prop?.multi_select?.options ?? [];
  return options.map((o) => o.name ?? "").filter(Boolean);
};

/**
 * The database's own select options, for the form's suggestions.
 *
 * Uncached on purpose. It is asked once per opening of a dialog only Bart can
 * open, and the one moment its answer matters most is the moment after he has
 * added a set that did not exist before: a cached list would then still be
 * offering yesterday's sets to the person who just created today's.
 */
export async function cardFields(token: string): Promise<CardFields> {
  const res = await fetch(`https://api.notion.com/v1/databases/${TRADING_DATABASE}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await notionError(res, `Notion refused the database (${res.status}).`));
  }
  const schema = (await res.json()) as Schema;
  return {
    sets: optionsOf(schema, "Set"),
    rarities: optionsOf(schema, "Rarity"),
    gens: optionsOf(schema, "Gen"),
    types: optionsOf(schema, "Type"),
  };
}
