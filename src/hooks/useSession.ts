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
  /** Whether the last refusal was "confirm your address first". */
  const [unconfirmed, setUnconfirmed] = useState(false);

  const signIn = useCallback(
    async (email: string, value: string): Promise<boolean> => {
      setError(null);
      const res = await fetch("/api/v1/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          unconfirmed?: boolean;
        };
        setError(body.error ?? "That email or password is not right.");
        // Kept apart from the message, because the form does something with it
        // rather than only saying it: an unconfirmed account is the one refusal
        // with a way out, and the way out is a button.
        setUnconfirmed(body.unconfirmed === true);
        return false;
      }
      setUnconfirmed(false);
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
   * Making an account, which does not sign you in.
   *
   * Confirmation is on, so what comes back is an account nobody can use until
   * the link in their mail is opened. The route says so with `pending`, and this
   * returns it rather than deciding: whether the person is through the door is
   * the server's answer to give, and a client that assumed otherwise would send
   * them to a collection they cannot load.
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      /** What to call them. Optional, and left out entirely when it is empty so
       *  the account starts with no name rather than with an empty one. */
      name?: string,
    ): Promise<{ ok: boolean; pending?: boolean }> => {
      setError(null);
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(name ? { email, password, name } : { email, password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        pending?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "That account could not be created.");
        return { ok: false };
      }
      startTransition(() => router.refresh());
      return { ok: true, pending: body.pending === true };
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
    /**
     * `currentPassword` is optional because one of the two callers genuinely
     * cannot supply it: somebody who arrived through a recovery link does not
     * have the old password, which is why they are there. Omitting it is a real
     * state and not a missing argument — the route sends the parameter on to
     * Supabase only when it arrives.
     */
    async (password: string, currentPassword?: string): Promise<boolean> => {
      setError(null);
      const res = await fetch("/api/v1/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentPassword ? { password, currentPassword } : { password }),
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

  /**
   * Forget the last failure.
   *
   * Needed because the error outlives the attempt that produced it. Move
   * between the sign-in and sign-up forms, or reopen the profile panel, and the
   * previous screen's "that email or password is not right" is still sitting
   * there under a form nobody has submitted yet.
   */
  const clearError = useCallback(() => setError(null), []);

  /**
   * Another confirmation link. Always reports success, because the route always
   * answers success — whether an address has an account is not a thing this app
   * tells whoever asks.
   */
  const resendConfirmation = useCallback(async (email: string): Promise<void> => {
    await fetch("/api/v1/confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }, []);

  return {
    signIn,
    signOut,
    signUp,
    requestReset,
    setPassword,
    resendConfirmation,
    clearError,
    pending,
    error,
    unconfirmed,
  };
}
