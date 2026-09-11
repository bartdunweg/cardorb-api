import { catalogueTimeout } from "@/lib/core/util";

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
 * and nothing waits past the catalogue's own timeout. Unconfigured — no URL,
 * no secret — it does nothing, which is what a preview of this API wants.
 */
export async function forgetOnTheWeb(who: { userId: string; username: string }): Promise<void> {
  const url = process.env.WEB_REVALIDATE_URL?.trim();
  const secret = process.env.WEB_REVALIDATE_SECRET?.trim();
  if (!url || !secret) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(who),
      cache: "no-store",
      signal: catalogueTimeout(),
    });
    if (!res.ok) console.error(`The web did not take the profile change: ${res.status}`);
  } catch (err) {
    console.error(
      "The web could not be told of the profile change:",
      err instanceof Error ? err.message : err,
    );
  }
}
