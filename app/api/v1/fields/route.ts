import { NextResponse } from "next/server";
import { cardFields } from "../../../../lib/core/cards-add";
import { refuseUnauthorised, readHeaders } from "../../../../lib/api/guard";

/**
 * What the database's select columns currently offer, so a form is built from
 * the database rather than from a list written down beside it. A set added this
 * morning is offered this afternoon, and a renamed rarity does not leave a
 * client offering the old name.
 *
 * Behind the key, unlike the other two reads, and not because the answer is
 * secret: it is the cheapest thing a client can call to find out whether the
 * key it holds still works. Every client signs in by asking for this, so a
 * wrong key fails on one request before a card has been typed out.
 *
 * Uncached. The one moment its answer matters most is the moment after a set
 * has been created that did not exist before, and a cached list would then be
 * offering yesterday's sets to the person who just made today's.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const no = refuseUnauthorised(req);
  if (no) return NextResponse.json({ error: no.error }, { status: no.status, headers: readHeaders });

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error("NOTION_TOKEN is not set");
    return NextResponse.json({ error: "Notion is not connected here." }, { status: 503 });
  }

  try {
    return NextResponse.json(await cardFields(token), { headers: readHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notion did not answer.";
    console.error("Card fields failed:", message);
    // Notion's own words. The only person who can read this is the one who can
    // act on it, and "something went wrong" would send them to the logs for a
    // message that is already here.
    return NextResponse.json({ error: message }, { status: 502, headers: readHeaders });
  }
}
