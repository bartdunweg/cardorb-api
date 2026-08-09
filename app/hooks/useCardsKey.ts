"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Signing in and out. The key itself is not here any more.
 *
 * This used to hold the passcode in localStorage and hand it to every request
 * as an x-cards-key header. That worked, and it had one flaw that could not be
 * patched from inside the browser: the server could not see it. Every render
 * therefore started signed out and the owner's view arrived a frame later, on
 * top of the public one. Once there was a public page worth telling apart from
 * the private one, that stopped being a cosmetic problem.
 *
 * So the key lives in an httpOnly cookie now, set by POST /api/v1/session, and
 * this hook never sees it. `signedIn` is not stored here either: it is read
 * from the cookie on the server and passed down as a prop, which is the whole
 * point of the change. What is left is the two verbs.
 *
 * router.refresh() after each one, because whether you are signed in is now
 * part of what the server rendered: re-fetching is what makes the plus appear
 * without a full reload.
 */
export function useCardsKey() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (email: string, value: string): Promise<boolean> => {
      setError(null);
      const res = await fetch("/api/v1/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, key: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That email or password is not right.");
        return false;
      }
      // Only the refresh, so the server re-renders knowing about the cookie.
      // Where to go next is the caller's question: on /cards you are already
      // there, and on / there is a redirect waiting that a refresh alone does
      // not follow. SignInForm decides.
      startTransition(() => router.refresh());
      return true;
    },
    [router],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/v1/session", { method: "DELETE" });
    // Signing out on /cards has to leave /cards, so this navigates rather than
    // refreshing in place. refresh() after the push because the router may
    // still be holding a cached render of / from before the cookie went, which
    // would show the signed-in redirect for a beat.
    router.push("/");
    router.refresh();
  }, [router]);

  return { signIn, signOut, pending, error };
}
