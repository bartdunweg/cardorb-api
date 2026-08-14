/**
 * What a name and a password have to be, in one place.
 *
 * Three things need to agree about a username and they are in three different
 * languages: this file, the check constraint on profiles.username, and the
 * reserved list the sign-up route consults. When they disagree the failure is
 * always the same shape — a form that accepts something the database then
 * refuses — so the rule is written here and the constraint is quoted beside it.
 */

/**
 * Two to thirty characters, lowercase letters, digits and hyphens, not starting
 * with a hyphen.
 *
 * The same expression as `username_shape` in the accounts migration. Not
 * imported from anywhere, because SQL cannot import; kept identical by being
 * written down twice with a note saying so, which is the honest version of a
 * shared rule across two languages.
 */
const SHAPE = /^[a-z0-9][a-z0-9-]{1,29}$/;

/** Long enough to be worth having, matching minimum_password_length in config.toml. */
export const MIN_PASSWORD = 10;

export type NameCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether a name may be claimed, said in sentences somebody can act on.
 *
 * Each rule gets its own message rather than one "invalid username", because
 * the whole point of a rule the user can see is that they can satisfy it. The
 * order matters: the emptiest failure is reported first, so somebody who typed
 * nothing is told to type something rather than told about hyphens.
 */
export function validateUsername(name: string): NameCheck {
  if (!name) return { ok: false, error: "Pick a name for your collection's link." };
  if (name.length < 2) return { ok: false, error: "That name is too short." };
  if (name.length > 30) return { ok: false, error: "That name is too long." };
  if (name !== name.toLowerCase()) {
    // Not an error worth raising to somebody who typed capitals: the form
    // lowercases as they type. This catches a client that did not.
    return { ok: false, error: "A name is all lowercase." };
  }
  if (name.startsWith("-")) return { ok: false, error: "A name cannot start with a hyphen." };
  if (!SHAPE.test(name)) {
    return { ok: false, error: "A name can hold letters, numbers and hyphens." };
  }
  return { ok: true };
}
