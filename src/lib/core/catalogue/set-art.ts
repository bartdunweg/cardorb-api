/**
 * A set's wordmark, from whichever source holds it.
 *
 * Its own file because both set catalogues need it: the one built from TCGdex (catalogue.ts) and
 * the one built from the copy in Postgres (set-catalogue-mirror.ts). Left in catalogue.ts the
 * second would have had to import the first, which imports the second.
 */
import { localise } from "../util";
import { ptcgLogo } from "./ptcg";

/**
 * The black star every promo set wears, which TCGdex publishes once, under the
 * Sword & Shield promos. It is not that set's branding: it is the mark printed
 * on the cards themselves, and it is the same on all of them.
 */
const PROMO_STAR = "https://assets.tcgdex.net/en/swsh/swshp/logo.webp";

/**
 * A set's wordmark. Both sources hand the file over already named, because they name it
 * differently: TCGdex publishes an extensionless address and the copy stores the finished one.
 */
export async function setArt(name: string, logo: string | null, symbol: string | null) {
  if (logo) return localise(logo);
  if (/black star promos/i.test(name)) return localise(PROMO_STAR);
  // Their logo before TCGdex's symbol: the symbol for a set with no logo is a
  // 25px box with the set's three-letter code in it, which in a rail of
  // wordmarks reads as a placeholder rather than as a set.
  const theirs = await ptcgLogo(name);
  if (theirs) return localise(theirs);
  if (symbol) return localise(symbol);
  return null;
}
