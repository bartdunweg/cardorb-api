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
 */
const WEB_TIMEOUT_MS = 2_000;
export async function forgetOnTheWeb(who: { userId: string; token?: string }): Promise<void> {
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
      body: JSON.stringify({ userId: who.userId, username }),
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
