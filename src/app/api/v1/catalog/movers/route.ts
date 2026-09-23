import { NextResponse } from "next/server";
import { apiError, unavailable } from "@/lib/api/respond";
import { authoriseOpen, openReadHeaders, readHeaders, refused } from "@/lib/api/guard";
import { getMarketMovers } from "@/lib/core/collection/collection";

/**
 * The cards whose market price moved most over the last seven days across the whole English
 * catalogue, ten up and ten down (getMarketMovers). Not anybody's collection: /v1/movers is that.
 *
 * cardorb.com shows it on Home to a visitor with no account, in the place a signed-in reader sees
 * the movers of their own cards, so the page carries real prices where it would otherwise be blank.
 * Ranked as a person's movers are, by the euros a move is worth and never its percentage, per copy
 * of one printing, after the same stray-sale filtering every price line gets.
 *
 * Open, since 2026-09-23. Every price in it is a catalogue price, public since 2026-09-22, and no
 * reader's holdings are read, so a named reader and a stranger are answered the same body. For the
 * same reason every 200 takes the open window, named or not: the answer is nobody's, and Vary keeps
 * a shared cache from mixing the two kinds of request anyway. A credential that is offered and does
 * not verify is still refused, and every refusal keeps readHeaders(): a refusal is nobody's to hold.
 *
 * 503 where the market could not be read, never an empty list: two empty lists say nothing moved,
 * and a store that is down is not that. Two empty lists are the answer where nothing did.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const who = await authoriseOpen(req);
  if (who && refused(who))
    return apiError(who.status, who.error, undefined, {
      headers: { ...readHeaders(req), ...who.headers },
    });

  const { up, down, failed } = await getMarketMovers();
  if (failed)
    return unavailable(
      "The market's movers could not be read. Try again in a moment.",
      readHeaders(req),
    );
  return NextResponse.json({ up, down }, { headers: openReadHeaders(req) });
}
