/**
 * The locale every number and every sort in here is answered in.
 *
 * Dutch, because Bart is, and because it decides two visible things: how a
 * thousand is punctuated and how two set names compare when they differ only by
 * an accent. It is not a translation switch; there is nothing here to translate.
 */
export const LOCALE = "nl-NL";

/**
 * Whose collection /user/<name> shows.
 *
 * One name, from the environment, because there is one person here. It is a
 * variable rather than a constant so the public URL can be changed without a
 * code change, and it is read in exactly one place (app/user/[username]) so
 * that when accounts arrive there is a single lookup to replace rather than a
 * string to hunt for.
 */
export const PUBLIC_USERNAME = process.env.PUBLIC_USERNAME ?? "bartdunweg";
