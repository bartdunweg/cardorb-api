import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/api/guard";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { adminClient } from "@/lib/storage/supabase";
import { validateUsername } from "@/lib/core/account";

/**
 * Whether a name is free, while somebody is still typing it.
 *
 * This endpoint answers a question the rest of the app is careful not to: it
 * says whether a given name belongs to somebody. That is what makes it useful
 * and it is also, said plainly, a way to enumerate who is here — ask it enough
 * times and you have the membership list.
 *
 * So it is built as though that is the threat, rather than pretending it is
 * not. Three things stand in the way of using it that way:
 *
 * Same-origin only, so it answers this app's own sign-up form and not a script
 * somewhere else. This sentence described an intention rather than the code for
 * a while — the check was named here and never written, so a page on any domain
 * could run this against every one of its visitors, each getting its own bucket
 * in a per-instance map. What it stops is that browser-swarm case. It does not
 * stop `curl`: sameOrigin() passes a request with no Origin header, by design
 * (lib/api/guard.ts), so a single script with a blank Origin still gets sixty a
 * minute. Slow and attributable, not impossible — as the closing note says.
 *
 * Rate limited hard, at sixty a minute per address. A person filling in a form
 * makes a handful of these; the debounce in the browser means one per pause in
 * typing, not one per keystroke. Sixty is generous for the first and useless
 * for a list of every English word.
 *
 * And it never says more than free or taken. A reserved name and a claimed one
 * are both "not available", so this cannot be used to map which names the app
 * holds back, and no id, address or anything else about an owner is anywhere in
 * the answer.
 *
 * The honest summary: this makes enumeration slow and attributable rather than
 * impossible. That is the trade a sign-up form that tells you the name is taken
 * before you have typed a password is worth, and it is worth writing down that
 * it is a trade.
 */
const byAddress = createRateLimiter(60_000, 60);

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (byAddress(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { name } = await params;
  const username = name.trim().toLowerCase();

  // A malformed name is answered without asking the database anything. The form
  // shows the shape error instead, which is more useful than "not available"
  // for a name that could never have been available.
  const shape = validateUsername(username);
  if (!shape.ok) return NextResponse.json({ available: false, reason: shape.error });

  const db = adminClient();
  if (!db) return NextResponse.json({ available: false, reason: "Names cannot be checked here." });

  const [{ data: taken }, { data: reserved }] = await Promise.all([
    db.from("profiles").select("id").eq("username", username).maybeSingle(),
    db.from("reserved_usernames").select("name").eq("name", username).maybeSingle(),
  ]);

  // One answer for both, so this cannot be used to map the reserved list.
  if (taken || reserved) {
    return NextResponse.json({ available: false, reason: "That name is taken." });
  }
  return NextResponse.json({ available: true });
}
