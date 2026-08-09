/**
 * The Notion database this whole thing is a view of, and the shapes its rows
 * come back in.
 *
 * The id is not a secret; the token is what grants access to it. It is written
 * down in exactly one place on purpose, and that rule now spans two repos: the
 * portfolio at bartdunweg.com reads the same database for the "latest pull"
 * card on its about page, and its own lib/notion.ts carries the same note. Two
 * copies of an id is how two projects end up pointed at two different databases
 * six months apart.
 */

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
  properties?: Record<string, NotionProperty>;
  cover?: { external?: { url?: string }; file?: { url?: string } } | null;
};

/** A title or a rich-text column as one string. */
export const text = (p?: NotionProperty) =>
  (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
