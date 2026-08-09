"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The key that opens the plus on /cards, held in this browser.
 *
 * A shared passcode rather than an account (see app/api/cards/route.ts): one
 * person writes to that database. It lives in localStorage so a phone stays
 * signed in between visits, and it is sent as a header on every request rather
 * than kept in a cookie, because a header cannot be attached to a cross-site
 * request without a preflight the route refuses.
 *
 * Read through useSyncExternalStore rather than copied into state in an effect.
 * localStorage is exactly the external store that hook is for: the server has
 * none, so the server snapshot is null and the HTML is rendered signed out,
 * and the browser's own value arrives once hydration is done. The plus appears
 * a frame after the page, which is the price of not shipping a hydration
 * mismatch across the whole bar.
 *
 * The subscription is not decoration either. A `storage` event fires in every
 * other tab, so signing out on one signs out the rest; it does not fire in the
 * tab that wrote it, which is what the local listeners below are for.
 */
const STORAGE = "cards-key";

/** localStorage throws rather than returns null where a browser has walled it off. */
const read = () => {
  try {
    return window.localStorage.getItem(STORAGE);
  } catch {
    return null;
  }
};

const listeners = new Set<() => void>();
const announce = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The value held in this tab, so a browser that refuses localStorage still
 * works for the length of a visit. Null means "ask the store", which is the
 * state every visit starts in.
 */
let local: string | null = null;
const snapshot = () => local ?? read();
/** No localStorage on the server, so nobody is signed in in the HTML. */
const serverSnapshot = () => null;

export function useCardsKey() {
  const key = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const signIn = useCallback((value: string) => {
    local = value;
    try {
      window.localStorage.setItem(STORAGE, value);
    } catch {
      // Not remembered for next time, but usable for this visit.
    }
    announce();
  }, []);

  const signOut = useCallback(() => {
    local = null;
    try {
      window.localStorage.removeItem(STORAGE);
    } catch {
      // Nothing to remove.
    }
    announce();
  }, []);

  return { key, signedIn: key !== null, signIn, signOut };
}
