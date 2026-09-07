/**
 * The collection in Postgres, through PostgREST.
 *
 * The same three verbs the Notion adapter beside this one offers, against a
 * table instead of a database-shaped document. Two things are different in kind
 * rather than in detail, and both are worth knowing before reading the code.
 *
 * **There is no user_id anywhere below.** Not in the selects, not in the
 * inserts. That is not an omission: the client carries the caller and the
 * policies in the accounts migration apply them, and `cards.user_id` defaults
 * to `auth.uid()`. Adding a WHERE clause here would be a second, weaker copy of
 * a rule the database already enforces — and the day the two disagree, the copy
 * in the application is the one that will be wrong.
 *
 * **The options question changed shape.** Notion could be asked what its select
 * columns *offer*, because a Notion select has a schema. A text column does not,
 * so collection_options() answers with what is *in use* instead. Mostly the same
 * answer, with two differences worth expecting: an option nobody uses stops
 * being offered, and a brand new account opens the add dialog with four empty
 * lists.
 */

import { type CopyChanges, isLanguage } from "@/lib/core/collection/collection-row";
import type { FolderKind, FolderRule, PokedexSetting } from "@/lib/core/collection/folders";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isFinish,
  type CardDraft,
  type CardFields,
  type CardPatch,
  type CollectionRow,
  isFoilPattern,
} from "../core/collection/collection-row";
import type { ValueSnapshot } from "../core/collection/value-snapshot";
import type { CardPricePoint } from "../core/collection/movers";

/** The row as the table has it, before it is turned into the shape above. */
type CardRecord = {
  id: string;
  name: string;
  number: string;
  set_name: string;
  rarity: string | null;
  gen: string | null;
  types: string[] | null;
  owned: boolean;
  excluded: boolean;
  acquired_at: string;
  finish: string | null;
  foil_pattern: string | null;
  quantity: number;
  condition: string | null;
  grade: string | null;
  language: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  is_favorite: boolean;
  collection_id: string | null;
};

const COLUMNS =
  "id,name,number,set_name,rarity,gen,types,owned,excluded,acquired_at,finish,foil_pattern,quantity,condition,grade,language,purchase_price,purchase_date,notes,is_favorite,collection_id";

/**
 * Supabase caps a response at a thousand rows and says so only by handing over
 * a thousand rows.
 *
 * This page size has to be at or under that cap, and the first version of this
 * file got it wrong in the most instructive way: it asked for two thousand at a
 * time and stopped when a page came back shorter than asked for. The server
 * capped the first page at a thousand, "shorter than asked for" was true
 * immediately, and the loop exited having read half the collection. A 1,968
 * card binder rendered as 836 cards across 41 of its 52 sets, and nothing
 * anywhere reported an error — it simply looked like a smaller collection.
 *
 * So: page at the cap, and do not infer completeness from the shape of a
 * response. The count below is asked for explicitly and the loop runs until it
 * has that many rows, which is the only version of this that stays correct if
 * the cap ever changes.
 */
const PAGE = 1_000;
const MAX_PAGES = 100;

const toRow = (r: CardRecord): CollectionRow => ({
  id: r.id,
  name: r.name,
  number: r.number ?? "",
  setName: r.set_name,
  rarity: r.rarity,
  gen: r.gen,
  types: r.types ?? [],
  owned: r.owned,
  excluded: r.excluded,
  acquiredAt: r.acquired_at ?? null,
  foilPattern: isFoilPattern(r.foil_pattern) ? r.foil_pattern : null,
  // Whatever the column holds that is not one of the three reads as "not
  // recorded", which is also what a row written before this column existed
  // gives back.
  finish: isFinish(r.finish) ? r.finish : null,
  quantity: r.quantity ?? 1,
  condition: r.condition,
  grade: r.grade,
  language: isLanguage(r.language) ? r.language : null,
  purchasePrice: r.purchase_price,
  purchaseDate: r.purchase_date,
  notes: r.notes,
  isFavorite: r.is_favorite ?? false,
  collectionId: r.collection_id ?? null,
});

/**
 * Everything the caller is allowed to see, which for a signed-in person is
 * their own collection and for a public page is one that has said it is public.
 *
 * Ordered newest first, matching what the Notion query asked for, because that
 * is the order the value snapshot script reads and the order a wishlist reads
 * best in. The sort is on acquired_at rather than created_at for the reason
 * that column exists at all.
 */
export async function listRows(db: SupabaseClient, userId?: string): Promise<CollectionRow[]> {
  const pageOf = (page: number, counted: boolean) => {
    let q = db
      .from("cards")
      // Counted once, on the first page, so the read knows what finished looks
      // like rather than guessing from the size of a response.
      .select(COLUMNS, counted ? { count: "exact" } : {})
      .order("acquired_at", { ascending: false })
      // The tiebreak, and it is load-bearing rather than tidy. acquired_at is
      // not unique — a pack opened in one sitting gives dozens of rows the same
      // timestamp — and paging an unstable order means the database is free to
      // return a row on two pages and another on none. Sorting by something
      // unique after it makes the order total, and the pages disjoint.
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    // Only ever narrows what the policies already allow. Needed for the public
    // page, which reads somebody else's collection through a client that is not
    // them: without it the policy would hand over their own rows as well.
    if (userId) q = q.eq("user_id", userId);
    return q;
  };

  // The first page alone, for the count; the rest at once. A binder of two
  // thousand rows is two pages, and the second used to wait for the first:
  // after every write, the read that fills the row cache again is the one the
  // person is waiting on.
  const first = await pageOf(0, true);
  // Thrown rather than broken out of, for the same reason the Notion cursor
  // throws: a truncated binder is not a collection, it is an outage wearing
  // one, and the caller above knows how to fail soft.
  if (first.error) throw new Error(`Reading the collection failed: ${first.error.message}`);
  const total = typeof first.count === "number" ? first.count : Number.POSITIVE_INFINITY;
  const rows: CollectionRow[] = ((first.data ?? []) as CardRecord[]).map(toRow);

  const pages = Number.isFinite(total) ? Math.min(MAX_PAGES, Math.ceil(total / PAGE)) : 1;
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => pageOf(i + 1, false)),
    );
    for (const page of rest) {
      if (page.error) throw new Error(`Reading the collection failed: ${page.error.message}`);
      rows.push(...((page.data ?? []) as CardRecord[]).map(toRow));
    }
  }

  // Loud rather than short. A collection that is missing a third of itself and
  // says nothing is the failure this whole function is written against: it
  // renders as a smaller binder, which is indistinguishable from having sold
  // some cards.
  if (Number.isFinite(total) && rows.length < total) {
    throw new Error(`Read ${rows.length} of ${total} cards: the collection came back truncated.`);
  }

  return rows;
}

/** The snapshot row as the table has it. See the 20260816140000 migration. */
type SnapshotRecord = {
  snapshot_date: string;
  value_cents: number;
  cards: number;
  priced: number;
  unpriced: number;
};

/**
 * One person's value readings, oldest first.
 *
 * Oldest first because the card that draws them treats `snapshots[0]` as where
 * the record starts — "since December 2024" is that row's date — and reverses
 * nothing. The list is tens of rows even for a collection recorded weekly for
 * years, so there is no paging loop here and no cap to page under.
 *
 * `.eq("user_id", userId)` is here even though this file's own header says there
 * is no user_id anywhere below, and the exception is deliberate rather than an
 * oversight in either direction. That rule holds where the policy alone gets it
 * right; it was wrong once already, in exactly this shape — see the comment on
 * cachedRows() in lib/core/collection/collection.ts, where a brand new account asking for
 * its own empty collection was handed a public one because the policy allowed
 * the read and nothing had said whose. RLS is the wall against seeing what is
 * private; it is not a substitute for the application naming the collection it
 * wants.
 *
 * Cents become whole euros here, at the storage boundary, so nothing above this
 * line has to know the table counts in cents.
 */
export async function listValueSnapshots(
  db: SupabaseClient,
  userId: string,
): Promise<ValueSnapshot[]> {
  const { data, error } = await db
    .from("collection_value_snapshots")
    .select("snapshot_date,value_cents,cards,priced,unpriced")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: true });

  // Thrown rather than swallowed, for the same reason listRows throws: a series
  // with holes in it draws as a collection that lost value, and the caller
  // above knows how to fail soft without inventing a shape.
  if (error) throw new Error(`Reading the value history failed: ${error.message}`);

  return ((data ?? []) as SnapshotRecord[]).map((r) => ({
    date: r.snapshot_date,
    value: Math.round(r.value_cents / 100),
    cards: r.cards,
    priced: r.priced,
    unpriced: r.unpriced,
  }));
}

/**
 * Everyone with an account, for the weekly snapshot.
 *
 * Only the cron calls this, through the service role, because it is the one
 * operation with no person behind it — see adminClient() in ./supabase.ts.
 *
 * `profiles` rather than `select distinct user_id from cards`, which is the
 * more precise question: PostgREST has no DISTINCT, so asking it that way means
 * paging every card row to learn a handful of ids. Profiles is the small,
 * bounded table and one request answers it. The cost is that an account with an
 * empty collection is visited and skipped; the saving is that a sixteen-hundred
 * row read is not made to find that out.
 */
export async function listAccountIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("profiles").select("id");
  if (error) throw new Error(`Listing accounts failed: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/**
 * One reading, written where it belongs.
 *
 * Upserted on (user_id, snapshot_date) so a cron that runs twice in a day —
 * a retry, a manual trigger beside the schedule — corrects the point rather
 * than being refused by the unique index. Euros in, cents stored: the rounding
 * happens here, at the boundary, and only here.
 */
export async function writeValueSnapshot(
  db: SupabaseClient,
  userId: string,
  point: ValueSnapshot,
): Promise<void> {
  const { error } = await db.from("collection_value_snapshots").upsert(
    {
      user_id: userId,
      snapshot_date: point.date,
      value_cents: Math.round(point.value * 100),
      cards: point.cards,
      priced: point.priced,
      unpriced: point.unpriced,
    },
    { onConflict: "user_id,snapshot_date" },
  );
  if (error) throw new Error(`Writing a snapshot failed: ${error.message}`);
}

/** One dated price for one card, as the table has it. */
type PriceRecord = {
  tcg_id: string;
  snapshot_date: string;
  market_cents: number | null;
  holo_cents: number | null;
};

/**
 * Every reading for these cards since a date, oldest first.
 *
 * Chunked over the ids because a URL has a length and a collection has sixteen
 * hundred cards: PostgREST takes `in.(…)` as a query parameter, and one list of
 * that size is a request nothing will accept. Two hundred at a time keeps each
 * URL well inside any limit and costs eight requests for a whole binder.
 *
 * No user_id, and here that is not an omission to be justified — see the
 * 20260816220000 migration. A price is a fact about a card.
 */
export async function listCardPrices(
  db: SupabaseClient,
  tcgIds: string[],
  since: string,
): Promise<CardPricePoint[]> {
  const out: CardPricePoint[] = [];
  // PostgREST answers a thousand rows at most, whatever the query asks, and two
  // hundred cards over a few weeks of readings is more than that. So each chunk
  // is read in pages until one comes back short; before this, the later dates of
  // every chunk were silently missing and a folder's line stopped weeks early.
  const PAGE = 1000;
  for (let i = 0; i < tcgIds.length; i += 200) {
    const chunk = tcgIds.slice(i, i + 200);
    for (let page = 0; ; page++) {
      const { data, error } = await db
        .from("card_prices")
        .select("tcg_id,snapshot_date,market_cents,holo_cents")
        .in("tcg_id", chunk)
        .gte("snapshot_date", since)
        .order("snapshot_date", { ascending: true })
        // The tiebreak that makes the pages disjoint: many rows share a date.
        .order("tcg_id", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(`Reading card prices failed: ${error.message}`);
      const rows = (data ?? []) as PriceRecord[];
      for (const r of rows) {
        out.push({
          tcgId: r.tcg_id,
          date: r.snapshot_date,
          market: r.market_cents == null ? null : r.market_cents / 100,
          holo: r.holo_cents == null ? null : r.holo_cents / 100,
        });
      }
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

/**
 * A week's prices, written in one go.
 *
 * Chunked for body size rather than URL length, the same reason createRows()
 * chunks. Upserted on the primary key so a re-run corrects the day instead of
 * being refused.
 */
export async function writeCardPrices(
  db: SupabaseClient,
  points: CardPricePoint[],
  chunk = 500,
): Promise<void> {
  for (let i = 0; i < points.length; i += chunk) {
    const { error } = await db.from("card_prices").upsert(
      points.slice(i, i + chunk).map((p) => ({
        tcg_id: p.tcgId,
        snapshot_date: p.date,
        market_cents: p.market == null ? null : Math.round(p.market * 100),
        holo_cents: p.holo == null ? null : Math.round(p.holo * 100),
      })),
      { onConflict: "tcg_id,snapshot_date" },
    );
    if (error) throw new Error(`Writing card prices failed: ${error.message}`);
  }
}

/**
 * Writes one card and hands back its id.
 *
 * acquired_at is left to the column default, which is now(). That is right for
 * a card being added by hand — you are adding it because you just pulled it —
 * and wrong for an import, which is why createRows() below takes the date
 * explicitly instead.
 */
export async function createRow(db: SupabaseClient, draft: CardDraft): Promise<string> {
  const { data, error } = await db
    .from("cards")
    .insert({
      name: draft.name,
      number: draft.number,
      set_name: draft.set,
      rarity: draft.rarity || null,
      gen: draft.gen || null,
      types: draft.types,
      owned: draft.collection,
      excluded: draft.excluded,
      finish: draft.finish,
      foil_pattern: draft.foilPattern,
      quantity: draft.quantity,
      condition: draft.condition,
      language: draft.language,
      grade: draft.grade,
      purchase_price: draft.purchasePrice,
      purchase_date: draft.purchaseDate,
      notes: draft.notes,
      is_favorite: draft.isFavorite,
      collection_id: draft.collectionId,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) throw new Error(`The card could not be saved: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Changes to one printing, by its owner. Null when no row of theirs matched.
 *
 * The same shape as updateProfile(): only the keys present in `patch` are
 * touched, so a client that sends `{ isFavorite: true }` cannot accidentally
 * clear a note it never saw.
 *
 * Both the id and the user_id are in the query. cards_update is
 * `using (user_id = auth.uid())`, so the policy alone would find or refuse the
 * row — but the rule in .claude/rules/catalogue-and-collection.md stands:
 * every write of one person's rows names their userId in the query itself.
 * RLS is the wall against reaching what is private; it is not the application
 * saying whose row it wants, and an unscoped write no-ops silently the day a
 * policy loosens. renameFolder() and deleteFolder() below already do this.
 *
 * `.select().maybeSingle()` rather than a bare update: the caller needs the
 * row back to hand a client its own write, and a row that is not there or not
 * the caller's is zero rows, which maybeSingle() hands back as null. That null
 * is what the route answers 404 with. `.single()` used to sit here and made
 * zero rows a PostgREST error the route read as the store failing.
 */
export async function updateRow(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: CardPatch,
): Promise<CollectionRow | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("owned" in patch) row.owned = patch.owned;
  if ("excluded" in patch) row.excluded = patch.excluded;
  if ("finish" in patch) row.finish = patch.finish;
  if ("foilPattern" in patch) row.foil_pattern = patch.foilPattern;
  if ("quantity" in patch) row.quantity = patch.quantity;
  if ("condition" in patch) row.condition = patch.condition;
  if ("grade" in patch) row.grade = patch.grade;
  if ("language" in patch) row.language = patch.language;
  if ("purchasePrice" in patch) row.purchase_price = patch.purchasePrice;
  if ("purchaseDate" in patch) row.purchase_date = patch.purchaseDate;
  if ("notes" in patch) row.notes = patch.notes;
  if ("isFavorite" in patch) row.is_favorite = patch.isFavorite;
  if ("collectionId" in patch) row.collection_id = patch.collectionId;
  if ("acquiredAt" in patch) row.acquired_at = patch.acquiredAt;

  const { data, error } = await db
    .from("cards")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`That card could not be updated: ${error.message}`);
  return data ? toRow(data as CardRecord) : null;
}

export type InsertResult = { added: number; skipped: number };

/**
 * Many rows at once, for an import.
 *
 * Chunked, because a single insert of sixteen hundred rows is one request that
 * either works or loses all of it, and because PostgREST has opinions about
 * body size that are easier to stay under than to discover.
 *
 * `ignoreDuplicates` against the partial unique index on
 * (user_id, source, source_id) is the whole of what makes an import idempotent:
 * run it again next month and only the pages that are new arrive. It is also
 * why the count below is a subtraction rather than a length — Postgres will not
 * tell you what it declined to insert, only what it inserted.
 */
export async function createRows(
  db: SupabaseClient,
  userId: string,
  rows: CollectionRow[],
  source: "csv",
  chunk = 500,
): Promise<InsertResult> {
  /**
   * Counted before and after, not from what the insert returns.
   *
   * The obvious version — .select("id") on the upsert, count the rows — reports
   * zero for a run that inserted two thousand cards. ignoreDuplicates sends
   * `Prefer: resolution=ignore-duplicates`, and PostgREST then hands back no
   * representation at all.
   *
   * It is not a cosmetic count either. "0 cards added" after a successful
   * import reads as a failed import, and the next thing anybody does is run it
   * again.
   */
  const count = async () => {
    const { count: n, error } = await db
      .from("cards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw new Error(`Counting the collection failed: ${error.message}`);
    return n ?? 0;
  };

  const before = await count();

  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk).map((r) => ({
      name: r.name,
      number: r.number,
      set_name: r.setName,
      rarity: r.rarity,
      gen: r.gen,
      types: r.types,
      owned: r.owned,
      excluded: r.excluded,
      // What the copy is, where the file said. These used to be left out, so an
      // export carrying three reverse-holo copies of a card imported as one
      // normal one — the row was right in the file, right in CollectionRow, and
      // dropped on the last step before Postgres. createRow(), the one-card
      // path, has always written them.
      quantity: r.quantity,
      finish: r.finish,
      foil_pattern: r.foilPattern,
      condition: r.condition,
      language: r.language,
      notes: r.notes,
      // The one field an import must carry and a manual add must not. Null
      // falls back to the column default, which is now(), and the import says
      // out loud when that happened.
      ...(r.acquiredAt ? { acquired_at: r.acquiredAt } : {}),
      source,
      source_id: r.id,
    }));

    const { error } = await db
      .from("cards")
      .upsert(batch, { onConflict: "user_id,source,source_id", ignoreDuplicates: true });

    if (error) throw new Error(`Importing rows ${i}–${i + batch.length} failed: ${error.message}`);
  }

  const added = (await count()) - before;
  return { added, skipped: rows.length - added };
}

/**
 * Removes one card of the caller's. True when a row went; false when nothing
 * matched. The user_id clause is the same rule updateRow() explains.
 */
export async function deleteRow(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  // select("id") so the answer says what went: a delete that matched nothing
  // (no such row, or somebody else's) used to succeed silently and the route
  // answered 200 for a card it never touched.
  const { data, error } = await db
    .from("cards")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(`The card could not be removed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * What the form should offer, from the rows rather than from a schema.
 *
 * An RPC because PostgREST cannot express SELECT DISTINCT, and a single one
 * rather than four because four round trips to answer one dialog is three too
 * many. See collection_options() in the accounts migration.
 */
export async function optionsFor(db: SupabaseClient): Promise<CardFields> {
  const { data, error } = await db.rpc("collection_options");
  if (error) throw new Error(`The options could not be read: ${error.message}`);

  const out = (data ?? {}) as Partial<CardFields>;
  return {
    sets: out.sets ?? [],
    rarities: out.rarities ?? [],
    gens: out.gens ?? [],
    types: out.types ?? [],
  };
}

/** A public profile, or null where the name is unknown or not shared. */
export type PublicProfile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** The wishlist shows on the public page too. */
  wishlistPublic: boolean;
  /** The favorites, as a list of their own, on the public page too. */
  favoritesPublic: boolean;
  /** The Pokédex on the public page too, drawn with the owner's setting. */
  pokedexPublic: boolean;
  /** How the owner's Pokédex shows; a visitor sees it the same way. Null is the default. */
  pokedex: PokedexSetting | null;
};

/**
 * Who owns /user/<name>, if anybody is willing to say.
 *
 * The lookup the public route's own comment predicted years before there was a
 * table to do it in: "when there are accounts, this is already the shape that
 * asks the right question, and the check below becomes a lookup."
 *
 * A private profile and a missing one are the same answer on purpose. The
 * caller turns both into a 404, so the page cannot be used to ask whether a
 * name is taken by somebody who would rather not be found.
 */
export async function profileByUsername(
  db: SupabaseClient,
  username: string,
): Promise<PublicProfile | null> {
  const { data, error } = await db
    .from("profiles")
    .select(
      "id,username,display_name,avatar_url,wishlist_public,favorites_public,pokedex_public,pokedex",
    )
    .eq("username", username)
    .eq("is_public", true)
    .maybeSingle();

  if (error) throw new Error(`Reading that profile failed: ${error.message}`);
  if (!data) return null;

  const row = data as {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    wishlist_public: boolean;
    favorites_public: boolean;
    pokedex_public: boolean;
    pokedex: unknown;
  };
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    wishlistPublic: row.wishlist_public,
    favoritesPublic: row.favorites_public,
    pokedexPublic: row.pokedex_public,
    pokedex: (row.pokedex as PokedexSetting | null) ?? null,
  };
}

/**
 * Every collection that has opted into being found, for the sitemap.
 *
 * Names only: a sitemap needs a URL and a nothing else, and the fewer columns
 * this reads the less there is to leak if the policy behind it ever loosens.
 * The is_public filter is stated here as well as enforced by RLS, so the query
 * says what it means without a reader having to go and check the policy.
 *
 * Capped, because a sitemap is not a paginated resource and a very large one is
 * worse than a slightly short one — 50,000 URLs is the format's own ceiling and
 * this app is a long way below it either way.
 */
export async function publicUsernames(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("profiles")
    .select("username")
    .eq("is_public", true)
    .order("username")
    .limit(50_000);

  if (error) throw new Error(`Listing public profiles failed: ${error.message}`);
  return ((data ?? []) as { username: string }[]).map((row) => row.username);
}

/** A profile as its owner sees it, which is more than a stranger gets. */
export type OwnProfile = {
  username: string;
  displayName: string | null;
  isPublic: boolean;
  /** The wishlist on the public page too, while isPublic. */
  wishlistPublic: boolean;
  /** The favorites and the Pokédex on the public page too, while isPublic. */
  favoritesPublic: boolean;
  pokedexPublic: boolean;
  avatarUrl: string | null;
  /** Null until the welcome flow has been finished or skipped past. */
  onboardedAt: string | null;
  /** How the built-in Pokédex shows; null means every slot, missing ones too. */
  pokedex: PokedexSetting | null;
};

/**
 * The signed-in person's own profile row.
 *
 * Separate from profileByUsername() because the questions are different:
 * that one asks "is this name shared with me", filters on is_public, and
 * returns null for a private one. This asks "what are my settings", and a
 * private profile is exactly what it expects to find.
 *
 * No is_public filter and no user_id clause: the policy is `is_public or id =
 * auth.uid()`, and the id comes from the session rather than the query, so a
 * caller can only ever be handed their own.
 */
export async function ownProfile(db: SupabaseClient, userId: string): Promise<OwnProfile | null> {
  const { data, error } = await db
    .from("profiles")
    .select(
      "username,display_name,is_public,wishlist_public,favorites_public,pokedex_public,avatar_url,onboarded_at,pokedex",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Reading your profile failed: ${error.message}`);
  if (!data) return null;

  const row = data as {
    username: string;
    display_name: string | null;
    is_public: boolean;
    wishlist_public: boolean;
    favorites_public: boolean;
    pokedex_public: boolean;
    avatar_url: string | null;
    onboarded_at: string | null;
    pokedex: unknown;
  };
  return {
    username: row.username,
    displayName: row.display_name,
    isPublic: row.is_public,
    wishlistPublic: row.wishlist_public,
    favoritesPublic: row.favorites_public,
    pokedexPublic: row.pokedex_public,
    avatarUrl: row.avatar_url,
    onboardedAt: row.onboarded_at,
    pokedex: (row.pokedex as PokedexSetting | null) ?? null,
  };
}

/**
 * Changes to a profile, by its owner.
 *
 * Takes only the two fields that are the owner's to change. The username is not
 * here on purpose — it goes through the claim_username RPC, which checks the
 * reserved list inside the same statement so two people cannot both win a race
 * for one name. A plain update could not make that promise.
 *
 * RLS does the authorising: profiles_write is `update using (id = auth.uid())`,
 * so the WHERE below narrows and the policy decides. Both, because a query that
 * relies only on the policy is a query one bad refactor away from updating
 * every row it is allowed to see.
 */
export async function updateProfile(
  db: SupabaseClient,
  userId: string,
  patch: {
    displayName?: string | null;
    isPublic?: boolean;
    wishlistPublic?: boolean;
    favoritesPublic?: boolean;
    pokedexPublic?: boolean;
    avatarUrl?: string | null;
    onboardedAt?: string;
    pokedex?: PokedexSetting | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("displayName" in patch) row.display_name = patch.displayName;
  if ("isPublic" in patch) row.is_public = patch.isPublic;
  if ("wishlistPublic" in patch) row.wishlist_public = patch.wishlistPublic;
  if ("favoritesPublic" in patch) row.favorites_public = patch.favoritesPublic;
  if ("pokedexPublic" in patch) row.pokedex_public = patch.pokedexPublic;
  if ("avatarUrl" in patch) row.avatar_url = patch.avatarUrl;
  // Never null: finishing the welcome flow is a thing that happened, and
  // nothing in the app un-happens it. The route that sets this only ever
  // accepts `onboarded: true`, so the type here has no null in it either.
  if ("onboardedAt" in patch) row.onboarded_at = patch.onboardedAt;
  if ("pokedex" in patch) row.pokedex = patch.pokedex;

  const { error } = await db.from("profiles").update(row).eq("id", userId);
  if (error) throw new Error(`That change could not be saved: ${error.message}`);
}

/**
 * Claiming a name, through the function that can do it atomically.
 *
 * The RPC raises two different errors on purpose and this keeps them apart:
 * P0001 for a reserved name and 23505 for one somebody already has. They need
 * different sentences — "that name is not available" and "that name is taken"
 * are different facts, and collapsing them would make the reserved list look
 * like a very popular set of usernames.
 */
export type ClaimResult = { ok: true } | { ok: false; reason: "reserved" | "taken" | "failed" };

export async function claimUsername(db: SupabaseClient, wanted: string): Promise<ClaimResult> {
  const { error } = await db.rpc("claim_username", { wanted });
  if (!error) return { ok: true };
  if (error.code === "P0001" || /reserved/i.test(error.message)) {
    return { ok: false, reason: "reserved" };
  }
  if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
    return { ok: false, reason: "taken" };
  }
  console.error("Claiming a username failed:", error.message);
  return { ok: false, reason: "failed" };
}

/**
 * Folders: the `collections` table, which the web app made and this API now
 * owns the writes to. "Collection" already means the whole of what a person
 * owns everywhere in this repository, so here and in the contract these are
 * folders; the table keeps its name because a rename is a migration for no
 * behaviour.
 *
 * Every read and write names the user as well as relying on row level
 * security: a client that can only see its own rows still should not be able
 * to *say* another's id and get a silent no-op back as success.
 */
export type Folder = {
  id: string;
  name: string;
  /** Derived from `rule`, never stored: a folder with a rule fills itself. */
  kind: FolderKind;
  rule: FolderRule | null;
  /** Shown as a Pokédex, with its settings; null for a plain list. */
  pokedex: PokedexSetting | null;
  /** Shown on the owner's public profile, while the profile itself is public. */
  isPublic: boolean;
  createdAt: string;
};

type FolderRecord = {
  id: string;
  name: string;
  rule: unknown;
  pokedex: unknown;
  is_public: boolean;
  created_at: string;
};

const FOLDER_COLUMNS = "id,name,rule,pokedex,is_public,created_at";

const toFolder = (r: FolderRecord): Folder => {
  const rule = (r.rule as FolderRule | null) ?? null;
  const pokedex = (r.pokedex as PokedexSetting | null) ?? null;
  return {
    id: r.id,
    name: r.name,
    kind: rule ? "rule" : "manual",
    rule,
    pokedex,
    isPublic: r.is_public,
    createdAt: r.created_at,
  };
};

/** null when no folder of the caller's has that id. */
export async function getFolder(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<Folder | null> {
  const { data, error } = await db
    .from("collections")
    .select(FOLDER_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Reading that folder failed: ${error.message}`);
  return data ? toFolder(data as FolderRecord) : null;
}

export async function listFolders(db: SupabaseClient, userId: string): Promise<Folder[]> {
  const { data, error } = await db
    .from("collections")
    .select(FOLDER_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Reading the folders failed: ${error.message}`);
  return ((data ?? []) as FolderRecord[]).map(toFolder);
}

export async function createFolder(
  db: SupabaseClient,
  userId: string,
  name: string,
  rule: FolderRule | null,
  pokedex: PokedexSetting | null = null,
  isPublic = false,
): Promise<Folder> {
  const { data, error } = await db
    .from("collections")
    .insert({ user_id: userId, name, rule, pokedex, is_public: isPublic })
    .select(FOLDER_COLUMNS)
    .single();
  if (error) throw new Error(`That folder could not be created: ${error.message}`);
  return toFolder(data as FolderRecord);
}

export type FolderPatch = {
  name?: string;
  rule?: FolderRule;
  pokedex?: PokedexSetting | null;
  isPublic?: boolean;
};

/** null when no folder of the caller's has that id. Only what the patch names changes. */
export async function updateFolder(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: FolderPatch,
): Promise<Folder | null> {
  // The column is snake_case where the body is camelCase; the rest share their names.
  const { isPublic, ...rest } = patch;
  const changes = { ...rest, ...(isPublic !== undefined ? { is_public: isPublic } : {}) };
  const { data, error } = await db
    .from("collections")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select(FOLDER_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`That folder could not be changed: ${error.message}`);
  return data ? toFolder(data as FolderRecord) : null;
}

/**
 * The folders one person shows on their public profile, oldest first. Read through the
 * service role by the public routes (see getPublicFolders in lib/core/collection/collection.ts):
 * scoped to the one owner and to is_public rows here, in the query, since that client answers
 * to no policy.
 */
export async function listPublicFolders(db: SupabaseClient, userId: string): Promise<Folder[]> {
  const { data, error } = await db
    .from("collections")
    .select(FOLDER_COLUMNS)
    .eq("user_id", userId)
    .eq("is_public", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Reading the public folders failed: ${error.message}`);
  return ((data ?? []) as FolderRecord[]).map(toFolder);
}

/**
 * false when no folder of the caller's has that id. The cards filed in it are
 * taken out first, explicitly, rather than trusting the foreign key to do it:
 * the table was made outside this repository and its `on delete` is not
 * written down anywhere a reader could check.
 */
export async function deleteFolder(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const unfile = await db
    .from("cards")
    .update({ collection_id: null })
    .eq("collection_id", id)
    .eq("user_id", userId);
  if (unfile.error) throw new Error(`Emptying that folder failed: ${unfile.error.message}`);

  const { data, error } = await db
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(`That folder could not be deleted: ${error.message}`);
  return (data ?? []).length > 0;
}

/** One row of the caller's, or null. */
export async function getRow(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<CollectionRow | null> {
  const { data, error } = await db
    .from("cards")
    .select(COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Reading a card failed: ${error.message}`);
  return data ? toRow(data as CardRecord) : null;
}

const columnsFor = (changes: CopyChanges): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if ("finish" in changes) out.finish = changes.finish;
  if ("condition" in changes) out.condition = changes.condition;
  if ("grade" in changes) out.grade = changes.grade;
  if ("language" in changes) out.language = changes.language;
  if ("purchasePrice" in changes) out.purchase_price = changes.purchasePrice;
  if ("purchaseDate" in changes) out.purchase_date = changes.purchaseDate;
  if ("notes" in changes) out.notes = changes.notes;
  if ("collectionId" in changes) out.collection_id = changes.collectionId;
  if ("acquiredAt" in changes) out.acquired_at = changes.acquiredAt;
  return out;
};

/**
 * One more copy of a row, as its own row: the source's identity and inventory,
 * the changes applied, `count` held, pulled now unless the changes say when.
 * The source is untouched. Null where the source is not the caller's.
 */
export async function copyRow(
  db: SupabaseClient,
  userId: string,
  id: string,
  count: number,
  changes: CopyChanges,
): Promise<CollectionRow | null> {
  const src = await getRow(db, userId, id);
  if (!src) return null;
  const { data, error } = await db
    .from("cards")
    .insert({
      user_id: userId,
      name: src.name,
      number: src.number,
      set_name: src.setName,
      rarity: src.rarity,
      gen: src.gen,
      types: src.types,
      owned: src.owned,
      excluded: src.excluded,
      finish: src.finish,
      quantity: count,
      condition: src.condition,
      grade: src.grade,
      language: src.language,
      purchase_price: src.purchasePrice,
      purchase_date: src.purchaseDate,
      notes: src.notes,
      is_favorite: src.isFavorite,
      collection_id: src.collectionId,
      source: "manual",
      ...columnsFor(changes),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Copying a card failed: ${error.message}`);
  return toRow(data as CardRecord);
}

export type SplitResult =
  | { kind: "ok"; source: CollectionRow; copy: CollectionRow }
  | { kind: "missing" }
  | { kind: "too-many" };

/**
 * Some of a row's copies as a row of their own: the database function
 * split_card does both writes in one transaction and hands back the copy, then
 * the source. `count` at or above the quantity is "too-many": that is every
 * copy, and changing the row is the honest edit.
 */
export async function splitRow(
  db: SupabaseClient,
  userId: string,
  id: string,
  count: number,
  changes: CopyChanges,
): Promise<SplitResult> {
  const { data, error } = await db.rpc("split_card", {
    p_id: id,
    p_user_id: userId,
    p_count: count,
    p_changes: changes,
  });
  if (error) {
    if (error.message.includes("split-count")) return { kind: "too-many" };
    throw new Error(`Splitting a card failed: ${error.message}`);
  }
  const rows = ((data ?? []) as CardRecord[]).map(toRow);
  const [copy, source] = rows;
  if (!copy || !source) return { kind: "missing" };
  return { kind: "ok", copy, source };
}
