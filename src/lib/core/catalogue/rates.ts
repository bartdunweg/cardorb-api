import { catalogueTimeout, DAY } from "../util";

/**
 * How many euros a dollar is, from the European Central Bank's daily reference rate as
 * frankfurter.app relays it: free, keyless, and the rate a bank statement would use. A
 * TCGplayer price is in dollars, and a collection is valued in euros; the conversion is
 * what makes the second price source one figure with the first.
 *
 * Throws when the rate cannot be read, so the caller's day-long cache keeps nothing: a null
 * cached for a day was a day without TCGplayer prices. The caller turns the throw into null
 * for the request, and then no TCGplayer price is shown at all: a price in the wrong
 * currency is worse than none.
 */
export async function fetchUsdToEur(): Promise<number> {
  // frankfurter moved to a .dev host; the old one redirects, which is a round trip a day for nothing.
  const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=EUR", {
    next: { revalidate: DAY },
    signal: catalogueTimeout(),
  });
  if (!res.ok) throw new Error(`Dollar rate: ${res.status}`);
  const body = (await res.json()) as { rates?: { EUR?: unknown } };
  const rate = body.rates?.EUR;
  if (typeof rate !== "number" || !(rate > 0)) throw new Error("Dollar rate: no EUR in the answer");
  return rate;
}
