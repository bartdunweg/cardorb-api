"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Everything a browser does about who it is.
 *
 * This used to hold the passcode in localStorage and hand it to every request
 * as an x-cards-key header. That worked, and it had one flaw that could not be
 * patched from inside the browser: the server could not see it. Every render
 * therefore started signed out and the owner's view arrived a frame later, on
 * top of the public one. Once there was a public page worth telling apart from
 * the private one, that stopped being a cosmetic problem.
 *
 * So the session lives in httpOnly cookies now, written by the server through
 * POST /api/v1/session, and this hook never sees them. `signedIn` is not stored
 * here either: the server verifies it and passes it down as a prop, which is
 * the whole point of the change.
 *
 * What was two verbs is now five, and they are all the same shape: post, read
 * the server's own message on failure, refresh so the server re-renders knowing
 * who you are. The message is deliberately the server's rather than one written
 * here — "that name is taken" and "a password needs at least ten characters"
 * are decisions the route makes, and a second copy in the browser is a second
 * copy to keep in step.
 *
 * router.refresh() after each one, because whether you are signed in is now
 * part of what the server rendered: re-fetching is what makes the plus appear
 * without a full reload.
 */
export function useSession() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (email: string, value: string): Promise<boolean> => {
      setError(null);
      const res = await fetch("/api/v1/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That email or password is not right.");
        return false;
      }
      // Only the refresh, so the server re-renders knowing about the cookie.
      // Where to go next is the caller's question: on /cards you are already
      // there, and on /login there is a redirect waiting that a refresh alone
      // does not follow. SignInForm decides.
      startTransition(() => router.refresh());
      return true;
    },
    [router],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/v1/session", { method: "DELETE" });
    // Signing out on /cards has to leave /cards, so this navigates rather than
    // refreshing in place. refresh() after the push because the router may
    // still be holding a cached render from before the cookie went, which would
    // show the signed-in view for a beat.
    //
    // To / rather than /login: signing out and being handed the sign-in form
    // again reads as "that did not work". The landing page is where someone who
    // is not signed in belongs, and the way back in is a button on it.
    router.push("/");
    router.refresh();
  }, [router]);

  /**
   * Making an account, which signs you in on success — for now.
   *
   * That is true only while email confirmation is off, and it is off only while
   * there is no sender configured. When it goes on this stops redirecting and
   * starts saying "check your email", and the change is in the route rather
   * than here: this hook reports what the server did.
   */
  const signUp = useCallback(
    async (email: string, password: string, username: string): Promise<boolean> => {
      setError(null);
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That account could not be created.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    },
    [router],
  );

  /**
   * Asking for a way back in.
   *
   * Always reports success, because the endpoint always answers success: saying
   * "no account with that address" would turn a password reset form into a way
   * to ask who has an account here. The caller shows the same "if that address
   * has an account, a link is on its way" either way, and that sentence is
   * doing real work rather than being coy.
   */
  const requestReset = useCallback(async (email: string): Promise<boolean> => {
    setError(null);
    const res = await fetch("/api/v1/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "That could not be sent.");
      return false;
    }
    return true;
  }, []);

  /** Setting a new one, for somebody already holding a session. */
  const setPassword = useCallback(
    async (password: string): Promise<boolean> => {
      setError(null);
      const res = await fetch("/api/v1/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That password could not be set.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    },
    [router],
  );

  return { signIn, signOut, signUp, requestReset, setPassword, pending, error };
}
