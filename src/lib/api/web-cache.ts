import { isSubsetNumber } from "@/lib/core/catalogue/set-galleries";
import { setIdOf } from "@/lib/core/catalogue/tcgdex-language";
import { usernameOf } from "./viewer";

/**
 * Tells cardorb.com that a person's profile changed, so it drops what it
 * remembers of them.
 *
 * The web app keeps a public profile page and the owner's own dashboard for
 * five minutes, and drops them itself after a write made through the web. A
 * write made through this API — the iOS app's — it never heard of: a profile
 * switched to private in the app stayed open on the web for the rest of those
 * five minutes. This is the word.
 *
 * Best effort, and quick. A profile change that was saved is saved; the web
 * not answering only means it keeps its five minutes, so nothing here throws
 * and nothing waits past two seconds: a card write from the phone is answered
 * in the time the write took, not in the time the web took. Unconfigured — no
 * URL, no secret — it does nothing, which is what a preview of this API wants.
 *
 * Called after every write the web keeps a copy of: the profile, and since
 * the card and folder routes joined, everything that changes what a
 * dashboard or a public page shows.
 *
 * `write` names what changed, so the web drops only that part of what it keeps
 * (cardorb-web `cache-scopes.ts`): a card written from the phone need not drop
 * the profile, nor a profile flag every list. `all` is for a write whose reach
 * is not clear, an import; the web reads a name it does not know as `all` too.
 * `favorite` is a star and nothing else: the web keeps the binders and the set
 * pages, which no star changes. `dexFace` is a Pokédex face chosen and nothing else: the web
 * forgets only the lists that keep which card fronts a slot.
 *
 * `set` names the set the written card is in, where the route knows it (`webSetOf`). The web keeps
 * one set's page per set, so a card write that names its set drops that page and leaves every other
 * set's standing; one that cannot name it (an import, a bulk patch across sets, a row with no
 * catalogue id) drops them all, which is what every write did before. A name the web cannot read is
 * the same as none there, so a wrong one costs a wider forget and never a stale page.
 */
export const WEB_WRITES = ["all", "cards", "favorite", "binders", "profile", "dexFace"] as const;
export type WebWrite = (typeof WEB_WRITES)[number];

/**
 * The set a written row belongs to, as the web files its set pages: the catalogue card id up to its
 * last dash (`setIdOf`). Null for a row with no catalogue id, a card typed in by hand, and then the
 * web forgets every set page rather than the wrong one.
 *
 * Null for a subset's card too, a Trainer Gallery, a Galarian Gallery, a Shiny Vault, a Classic
 * Collection or an Unown Collection. Those are sets of their own in the catalogue, so TG12 of
 * Brilliant Stars carries `swsh12tg`, but the shelf folds them into the parent and the page a
 * reader has is the parent's, `swsh12` (set-galleries.ts, GET /v1/catalog/sets/{setId}). Naming
 * `swsh12tg` would drop a page only a kept address reads and leave the one showing the card
 * standing: that forgets less than before, the one thing this must never do. The parent's id is
 * not to be had here, it takes the shelf, so the row names no set and every set page goes, as it
 * did before any set was named.
 */
export const webSetOf = (
  tcgId: string | null | undefined,
  number?: string | null,
): string | null => (tcgId && !(number && isSubsetNumber(number)) ? setIdOf(tcgId) : null);

/**
 * The one set a group of written rows shares, where they share one: a bulk patch is usually a
 * handful of copies of the same card or one shelf's worth. Rows spread over several sets are null,
 * and the web forgets every set page, because naming one of them would leave the others stale.
 */
export const webSetOfAll = (
  rows: readonly { tcgId?: string | null; number?: string | null }[],
): string | null => {
  const sets = new Set(rows.map((row) => webSetOf(row.tcgId, row.number)));
  return sets.size === 1 ? ([...sets][0] ?? null) : null;
};

const WEB_TIMEOUT_MS = 2_000;
export async function forgetOnTheWeb(
  who: { userId: string; token?: string },
  write: WebWrite,
  set?: string | null,
): Promise<void> {
  const url = process.env.WEB_REVALIDATE_URL?.trim();
  const secret = process.env.WEB_REVALIDATE_SECRET?.trim();
  if (!url || !secret) return;
  // The name the web files a public page under, read here and nowhere else: it is the only
  // thing in this API that still needs it on a write, and reading it in `authorise()` made
  // every read of every route wait for it (viewer.ts). After the two env checks, so a preview
  // of this API with no web to tell asks Postgres nothing.
  const username = await usernameOf(who.userId, who.token);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: who.userId, username, write, ...(set ? { set } : {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(WEB_TIMEOUT_MS),
    });
    if (!res.ok) console.error(`The web did not take the profile change: ${res.status}`);
  } catch (err) {
    console.error(
      "The web could not be told of the profile change:",
      err instanceof Error ? err.message : err,
    );
  }
}
