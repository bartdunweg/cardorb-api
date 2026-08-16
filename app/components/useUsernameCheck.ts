"use client";

import { useEffect, useState } from "react";
import { validateUsername } from "../../lib/core/account";

/**
 * Whether a typed name is free, asked while there is still a chance to change
 * it rather than on submit.
 *
 * Shared by the welcome flow and Settings > Profile, because a username is
 * claimed in both places and the second one is not the lesser case: changing
 * your name changes your link, and finding out it was taken only after pressing
 * Save is the same bad minute either way.
 *
 * This is a courtesy, not the guarantee. Uniqueness is the database's:
 * `profiles.username` is a unique citext column, and claim_username() checks
 * the reserved list and takes the name inside one statement, so two people
 * racing for one name cannot both win it however long ago either of them was
 * told it was free. What this buys is knowing before you press the button.
 *
 * Debounced at 350ms, which the endpoint expects: it is rate limited at sixty
 * a minute per address precisely on the assumption that a form asks once per
 * pause in typing and not once per keystroke (see
 * app/api/v1/usernames/[name]/route.ts, which is candid about this being an
 * enumeration surface held open on purpose).
 */
export type NameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "taken"; reason: string };

export function useUsernameCheck(typed: string, current: string): NameState {
  const wanted = typed.trim().toLowerCase();
  const changed = wanted !== current;
  const shape = validateUsername(wanted);

  /**
   * Only the answer is kept, and the name it is an answer *about*. Everything
   * else — idle, checking — is a fact about the name typed right now, derived
   * below rather than stored: a stored "checking" has to be cleared by whatever
   * set it, and a stale one is the state where the field says it is still
   * working on a name you have already changed.
   */
  const [checked, setChecked] = useState<{
    name: string;
    available: boolean;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    if (!changed || !shape.ok) return;
    // A stale answer is dropped rather than rendered — two requests in flight
    // can land out of order, and "taken" arriving after you have already fixed
    // the name is worse than no answer at all.
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/usernames/${encodeURIComponent(wanted)}`);
        const data = (await res.json().catch(() => ({}))) as {
          available?: boolean;
          reason?: string;
        };
        if (!live) return;
        setChecked({ name: wanted, available: data.available === true, reason: data.reason });
      } catch {
        // A check that could not be made is not a name that is taken. Claiming
        // it will say so if it is; this is a nicety, not the gate.
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wanted, changed, shape.ok]);

  if (!changed) return { kind: "idle" };
  if (!shape.ok) return { kind: "taken", reason: shape.error };
  if (checked?.name !== wanted) return { kind: "checking" };
  return checked.available
    ? { kind: "free" }
    : { kind: "taken", reason: checked.reason ?? "That name is not available." };
}

/** The one line the field says about itself, or null while it has nothing. */
export function usernameSays(state: NameState, wanted: string): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "checking":
      return "Checking…";
    case "free":
      return `${wanted} is free.`;
    case "taken":
      return state.reason;
  }
}
