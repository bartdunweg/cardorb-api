import { catalogueTimeout, DAY } from "../util";

/**
 * How many euros a dollar is, from the European Central Bank's daily reference rate as
 * frankfurter.app relays it: free, keyless, and the rate a bank statement would use. A
 * TCGplayer price is in dollars, and a collection is valued in euros; the conversion is
 * what makes the second price source one figure with the first.
 *
 * Null when the rate cannot be read, and then no TCGplayer price is shown at all: a price
 * in the wrong currency is worse than none. Cached a day by the caller (collection.ts).
 */
export async function fetchUsdToEur(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", {
      next: { revalidate: DAY },
      signal: catalogueTimeout(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { rates?: { EUR?: unknown } };
    const rate = body.rates?.EUR;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch (err) {
    console.error("Dollar rate unavailable, TCGplayer prices withheld:", err);
    return null;
  }
}
