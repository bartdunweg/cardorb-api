import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createCard, validateCardDraft } from "../../../../lib/core/cards-add";
import { CARDS_TAG, forgetCollection } from "../../../../lib/core/cards";
import { refuseWrite, readHeaders } from "../../../../lib/api/guard";

/**
 * Adding a card. The only endpoint here that changes anything, and the reason
 * the key exists.
 *
 * It does not get to fail soft. Reading fails into an empty state and nobody
 * loses anything; a write that fails quietly loses the card that was just
 * pulled. Every refusal comes back as a message a client can show, in Notion's
 * own words where Notion is the one refusing.
 */

/** A card is eight short fields. Anything near this is a paste accident. */
const MAX_BODY_BYTES = 8_192;

export async function POST(req: Request) {
  const no = refuseWrite(req);
  if (no) return NextResponse.json({ error: no.error }, { status: no.status, headers: readHeaders });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: readHeaders });
  }

  let body: unknown;
  try {
    const raw = await req.text();
    // content-length can lie or be absent (chunked); check what arrived.
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413, headers: readHeaders },
      );
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: readHeaders });
  }

  const result = validateCardDraft(body);
  if (result.kind === "invalid") {
    return NextResponse.json({ error: result.error }, { status: 400, headers: readHeaders });
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error("NOTION_TOKEN is not set");
    return NextResponse.json(
      { error: "Notion is not connected here." },
      { status: 503, headers: readHeaders },
    );
  }

  let id: string;
  try {
    id = await createCard(result.draft, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notion did not answer.";
    console.error("Adding a card failed:", message);
    return NextResponse.json({ error: message }, { status: 502, headers: readHeaders });
  }

  // Two caches stand between the row and /v1/collection. The tag drops the
  // Notion query; forgetCollection() drops the walk memoised in this process
  // (see MEMO_TTL in lib/core/cards.ts for the instances it cannot reach).
  //
  // `{ expire: 0 }` rather than a named profile: a profile means
  // stale-while-revalidate, so the next reader would be handed the collection
  // from before this row while the new one is fetched behind them. Expiring at
  // zero is what makes the card the writer's own write rather than the one
  // after it.
  revalidateTag(CARDS_TAG, { expire: 0 });
  forgetCollection();

  return NextResponse.json({ ok: true, id }, { headers: readHeaders });
}

/**
 * The preflight the JSON content type above forces. Without an answer to this,
 * a browser on the tool's own domain never gets as far as sending the POST.
 */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const ok = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .includes(origin ?? "");
  return new Response(null, {
    status: ok ? 204 : 403,
    headers: ok
      ? {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, x-cards-key",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" },
  });
}
