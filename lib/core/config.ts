/**
 * What this thing is called.
 *
 * Two renames in one week, and both were the same lesson twice.
 *
 * It was "binder", which is also the word for the object a collection lives in,
 * and the two were impossible to tell apart: half the strings in this app say
 * "in the binder" meaning the folder on the shelf, and the title said the same
 * word meaning the product. That became "Pokebinder", which fixed the ambiguity
 * and bought a worse problem: this is about to have open signup, and "Poké" in
 * the name of a public product is somebody else's trademark. A tool for one
 * person can borrow a word. A product taking accounts cannot.
 *
 * So: Card Orb, which is the domain, says what it holds, and belongs to nobody
 * else. The word "binder" stays everywhere it means the folder — "In the
 * binder" on a card is still the right English.
 *
 * A constant rather than a string in each file, and this rename is the argument
 * for it: the whole change above was this line, two letters in the drawn icons,
 * and the package name. The title template, the og:site_name, the manifest,
 * both OG images, the landing page, the login and the 404 all followed.
 */
export const APP_NAME = "Card Orb";

/**
 * The sentence under the name, everywhere the name needs one.
 *
 * One line, because that is what a search result shows and what a link preview
 * shows, and writing two different ones is how they drift. It says what the
 * thing is and who it is for without adjectives: a search engine has no use for
 * "beautiful" and neither does anyone deciding whether to click.
 */
export const APP_TAGLINE =
  "Track your Pokémon card collection set by set — what you own, what it is worth, and what is still missing.";

/**
 * The same sentence, cut at the clause, for the places that have room for one
 * line and not four.
 *
 * A second string on purpose rather than a copy that drifts. It was living
 * hand-typed inside the OG image, which is how two sentences that are supposed
 * to say the same thing end up disagreeing: one gets edited and nobody thinks
 * to look inside a picture. Named here, beside the long one, so a change to
 * either is a change made while looking at both.
 *
 * Why it exists at all: a link preview is not somewhere anyone reads four
 * lines, and the full sentence sets to four at the size that card is drawn.
 */
export const APP_TAGLINE_SHORT =
  "Set by set — what you own, what it is worth, what is missing.";

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

/**
 * Whose collection the public link is showing.
 *
 * "My collection" is right on the screen you sign in to and wrong on the one
 * you hand to somebody else: there it is not theirs. A first name rather than
 * the username, because "bartdunweg's collection" reads like a handle and this
 * line is the page saying who it belongs to.
 *
 * An env var with a default, like PUBLIC_USERNAME beside it, and it becomes a
 * lookup on the same day that one does.
 */
export const OWNER_NAME = process.env.OWNER_NAME ?? "Bart";

/**
 * Where this app lives, absolutely.
 *
 * Needed the moment anything has to say its own address: a canonical, an
 * og:url, a sitemap. A relative path cannot do any of those.
 *
 * Three sources in order. An explicit NEXT_PUBLIC_SITE_URL wins, because a
 * custom domain is a decision rather than something to infer. Failing that,
 * Vercel's own production URL, which is right on every deploy without anyone
 * setting it — note this is the *project* production URL and not VERCEL_URL,
 * which is the per-deployment address and would put a preview's hostname in a
 * canonical. Failing both, localhost, so development does not emit somebody
 * else's domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");
