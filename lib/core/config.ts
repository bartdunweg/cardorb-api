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
export const APP_TAGLINE_SHORT = "Set by set — what you own, what it is worth, what is missing.";

/**
 * The name with enough of a sentence attached to be findable.
 *
 * The `<title>` of the landing page, and the og:title beside it. It used to be
 * the bare `APP_NAME`, set with `title.absolute` so the site-wide template could
 * not turn it into "Card Orb · Card Orb". That reasoning was right and the
 * result was still wrong: for a brand nobody is searching for yet, a title
 * containing no words anyone types is the weakest possible signal on the one
 * page carrying the site's authority.
 *
 * `absolute` stays — the template would still double the name — and this
 * constant is what it is set to. The root layout's `title.default` is the same
 * string, so a route with no title of its own reads identically.
 */
export const APP_TITLE = `${APP_NAME} — track your Pokémon card collection`;

/**
 * The locale every number and every sort in here is answered in.
 *
 * Dutch, because Bart is, and because it decides two visible things: how a
 * thousand is punctuated and how two set names compare when they differ only by
 * an accent. It is not a translation switch; there is nothing here to translate.
 */
export const LOCALE = "nl-NL";

/*
 * PUBLIC_USERNAME and OWNER_NAME used to live here.
 *
 * Both were env vars with a default — one naming the collection at /user/<name>,
 * the other naming its owner — and both were written with a note saying they
 * would become a lookup on the day accounts arrived. Accounts arrived; the
 * lookups are ownerOf() in lib/core/collection.ts and ownerLabel() in
 * lib/core/owner.ts, and a name that belongs to a person has no business being
 * deployment configuration. Nothing reads either variable now, so setting one
 * in an environment does nothing.
 */

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
