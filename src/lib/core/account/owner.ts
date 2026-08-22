/**
 * What to call the person a collection belongs to.
 *
 * There used to be one answer to this, an env var called OWNER_NAME defaulting
 * to "Bart", read by nine different render sites. That was true while there was
 * one person here and quietly wrong the moment there were two: a second account
 * with a public page got its own cards under the deployment owner's name, in the
 * title, the OG image, the JSON-LD and the sidebar heading.
 *
 * The name now comes from the profile being rendered, and this file is the one
 * place that decides what "the name" means. No React, no database, no
 * server-only: it is string handling, so a page, a route, an image and a test
 * can all reach it.
 */

/**
 * Enough of a profile to name it.
 *
 * Structural rather than an import of PublicProfile, so both the public shape
 * (lib/storage/postgres.ts) and the viewer shape (lib/api/viewer.ts) satisfy it
 * without either of them having to be the canonical one.
 */
export type Named = {
  username: string;
  displayName: string | null;
};

/**
 * The name they gave, or the name they were given.
 *
 * A missing display name falls back to the username on purpose. It is not
 * pretty — "swift-eevee-4821's Pokémon card collection" reads like a handle,
 * because it is one — but it is honest and it is theirs, where a generic "A
 * Pokémon card collection" would make every unnamed page identical to every
 * other. The Settings field shows the same fallback as its placeholder, so the
 * page and the form agree about what happens when the field is empty.
 *
 * Trimmed before it is tested, so a name of three spaces is a name nobody gave.
 */
export const ownerLabel = (who: Named): string => who.displayName?.trim() || who.username;

/**
 * Belonging to, in a title.
 *
 * Always ’s, including after a trailing s — "Lucas’s", not "Lucas’". The
 * apostrophe-only form is a contested style rule even for people who agree it
 * exists, and no amount of code can tell a surname ending in s from a plural.
 * One consistent rule is the smaller wrong answer.
 *
 * A typographic apostrophe rather than ', matching the &rsquo; the OG image has
 * always drawn.
 */
export const possessive = (name: string): string => `${name}’s`;

/** The <title>, the og:title and the JSON-LD name of a public collection. */
export const collectionTitle = (who: Named): string =>
  `${possessive(ownerLabel(who))} Pokémon card collection`;
