/**
 * Notion, in one file, where it can be replaced rather than unpicked.
 *
 * Everything here used to be spread across three modules: the id and the row
 * shapes in lib/core/notion.ts, the query loop and the column reader in
 * lib/core/cards.ts, the writes in lib/core/cards-add.ts. That was right while
 * Notion was simply where the collection lived. It stopped being right the
 * moment there was going to be a second store, because "which parts of this app
 * know about Notion" had no answer short of a search.
 *
 * Now it does: this file, and nothing else. What it exports is the same three
 * verbs any store has to offer — list the rows, write one, say what the options
 * are — and above it lib/core/cards.ts works in CollectionRow and has no idea
 * any of this is here.
 *
 * The id is not a secret; the token is what grants access to it. It is written
 * down in exactly one place on purpose, and that rule spans two repos: the
 * portfolio at bartdunweg.com reads the same database for the "latest pull"
 * card on its about page, and its own lib/notion.ts carries the same note. Two
 * copies of an id is how two projects end up pointed at two different databases
 * six months apart.
 */

import { CARDS_TAG, type CardDraft, type CardFields, type CollectionRow } from "../core/collection-row";

/**
 * Notion's REST version. Pinned on purpose: the API is versioned by date and an
 * unpinned client gets whatever is current, which is how integrations break on
 * a morning nobody deployed anything.
 */
export const NOTION_VERSION = "2022-06-28";

/** The card collection. 1,600-odd rows, one per printing held or wanted. */
export const TRADING_DATABASE = "cfae17e0-bdab-4ca0-9b27-d3baac32b2ae";

export type NotionProperty = {
  type?: string;
  title?: { plain_text?: string }[];
  rich_text?: { plain_text?: string }[];
  url?: string | null;
  number?: number | null;
  select?: { name?: string } | null;
  multi_select?: { name?: string }[];
  status?: { name?: string } | null;
  checkbox?: boolean;
  date?: { start?: string | null; end?: string | null } | null;
  /** `name` is only present when the integration may read user information. */
  people?: { id?: string; name?: string }[];
};

export type NotionPage = {
  id?: string;
  /**
   * When the row was made, which for this database is when the card joined the
   * collection.
   *
   * Nothing in the app read it until now — the page only ever showed what is
   * held, not when it arrived — and it is here because the migration needs it:
   * it becomes acquired_at, and without it the value history in
   * scripts/snapshot-collection-value.mjs has nothing to stand on.
   */
  created_time?: string;
  properties?: Record<string, NotionProperty>;
  cover?: { external?: { url?: string }; file?: { url?: string } } | null;
};

/** A title or a rich-text column as one string. */
export const text = (p?: NotionProperty) =>
  (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");

/**
 * One column off a row, found by name.
 *
 * By name rather than by value, since unlike a country a rarity or a type is
 * not self-identifying: "Rare" and "Fire" could be anything. The name is
 * matched loosely so Rarity, rarity or "Card rarity" all work, and the value is
 * read from whichever shape the property happens to be: select, multi-select,
 * text or number.
 *
 * This lived in cards.ts, where the loose matching was close to pointless: the
 * columns were Bart's own and he knew what they were called. Here it earns it.
 * When somebody else connects their Notion database, the column names are a
 * stranger's, and "Card rarity" really might be what they called it.
 */
export function fieldOf(props: Record<string, NotionProperty>, match: RegExp): string | null {
  for (const [name, p] of Object.entries(props)) {
    if (!match.test(name)) continue;
    const value =
      p.select?.name ??
      (p.multi_select ?? [])
        .map((o) => o.name)
        .filter(Boolean)
        .join(", ") ??
      "";
    const out = value || text(p) || (typeof p.number === "number" ? String(p.number) : "");
    if (out) return out;
  }
  return null;
}

/**
 * A Notion page as a row.
 *
 * The two subtleties are both about defaults, and both were load-bearing where
 * they used to sit inline in the walk. `owned` is `!== false`, so a row with no
 * checkbox at all counts as held — that is how the database has always read.
 * And `types` is split back out of the string fieldOf() joins, because a
 * multi-select is a list everywhere except in the one helper that flattens it.
 */
export function rowFromPage(page: NotionPage): CollectionRow | null {
  const props = page.properties ?? {};
  const name = text(props.Name);
  const setName = props.Set?.select?.name ?? "";
  // The same two guards the grouping used to apply, moved to where the row is
  // made: a row without a set or a name cannot be placed or drawn, and passing
  // it on only means every consumer needs the same check.
  if (!setName || !name) return null;

  const types = fieldOf(props, /^type/i);

  return {
    id: page.id ?? null,
    name,
    number: text(props.Number),
    setName,
    rarity: fieldOf(props, /rarit/i),
    gen: fieldOf(props, /^gen/i),
    types: types ? types.split(",").map((t) => t.trim()).filter(Boolean) : [],
    owned: props.Collection?.checkbox !== false,
    excluded: props.Excluded?.checkbox === true,
    acquiredAt: page.created_time ?? null,
    // Notion has no columns for these — see docs/decisions/0006. Same
    // defaults a fresh Postgres row gets, so a row's shape does not announce
    // which store it came from.
    quantity: 1,
    condition: null,
    grade: null,
    purchasePrice: null,
    purchaseDate: null,
    notes: null,
    isFavorite: false,
  };
}

/**
 * Every row in the database. Notion caps a query at 100 rows, so this follows
 * the cursor. The page limit is a backstop against a runaway loop, not a real
 * ceiling: 20 pages is 2000 cards.
 */
export async function listRows(token: string, databaseId = TRADING_DATABASE): Promise<CollectionRow[]> {
  const rows: CollectionRow[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20; page++) {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // No filter. It used to ask only for Collection = true, which left the
        // wishlist invisible: those rows are the same cards, wanted rather than
        // held, and worth showing as such.
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
      // A collection changes when a pack is opened, not by the minute. Must be
      // a cached fetch either way: a `no-store` here would turn the page
      // dynamic and make every visitor wait on the whole walk.
      //
      // Tagged, because there is now one thing that knows better than the hour:
      // /v1/cards, which has just added a row and revalidates this tag so the
      // card appears on the page it was added from rather than up to an hour
      // later.
      //
      // Worth knowing for what comes next: this cache exists because the read is
      // a fetch. A Postgres query cannot carry these options, so the adapter
      // beside this one has to bring its own cache — see lib/core/collection.ts.
      next: { revalidate: 3600, tags: [CARDS_TAG] },
    });
    // Thrown rather than broken out of. A break here returned whatever had been
    // collected so far, which for a refusal on the first page is nothing and for
    // one on the fourth is a truncated binder, and the memo above then remembered
    // either as the answer. Neither is a collection; both are an outage.
    if (!res.ok) throw new Error(`Notion cards query failed: ${res.status}`);

    const body = (await res.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    for (const result of body.results ?? []) {
      const row = rowFromPage(result);
      if (row) rows.push(row);
    }
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }

  return rows;
}

/**
 * A select option cannot hold a comma: Notion splits on it.
 *
 * This lived in the shared validation for a long time, where it read as a rule
 * about what a card may be called and quietly refused a set genuinely named
 * "Sun & Moon, Promos". It is not that. It is a fact about one store's select
 * columns, so it belongs at that store's door, applied on the way out.
 *
 * A space rather than nothing, because "A,B" is two words and "AB" is neither.
 */
const option = (s: string) => s.replace(/,+/g, " ").replace(/\s+/g, " ").trim();

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
    Set: { select: { name: option(draft.set) } },
  };
  if (draft.number) props.Number = { rich_text: [{ text: { content: draft.number } }] };
  if (draft.rarity) props.Rarity = { select: { name: option(draft.rarity) } };
  if (draft.gen) props.Gen = { select: { name: option(draft.gen) } };
  if (draft.types.length)
    props.Type = { multi_select: draft.types.map((name) => ({ name: option(name) })) };
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
export async function createRow(draft: CardDraft, token: string): Promise<string> {
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
 * Uncached on purpose. It is asked once per opening of a dialog only the owner
 * can open, and the one moment its answer matters most is the moment after they
 * have added a set that did not exist before: a cached list would then still be
 * offering yesterday's sets to the person who just created today's.
 *
 * Worth writing down what is peculiar about this one, because it does not
 * survive the move: it reads Notion's *schema*, so it answers with every option
 * that has ever been defined whether or not a card uses it. A table has no such
 * thing to read, and the Postgres version is a SELECT DISTINCT over the rows —
 * a different question with a mostly-similar answer.
 */
export async function optionsFor(token: string): Promise<CardFields> {
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
