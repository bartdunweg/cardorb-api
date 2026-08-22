import { NextResponse } from "next/server";
import { configured, serverClient } from "@/lib/storage/supabase";

/**
 * Something cheap to hit on a timer.
 *
 * Two jobs, and the second is the reason it exists. It is a monitor, which any
 * app can use; and it is a keepalive, which this one needs, because a free
 * Supabase project pauses after about a week of quiet and the first person to
 * notice would be whoever opened the public link. A daily cron against this
 * route is enough to count as activity.
 *
 * Deliberately says almost nothing. A health endpoint is the one route with no
 * authentication at all, so everything it reports is reported to everybody:
 * which services are configured is a fair thing to say out loud, and which
 * versions, hosts or errors are behind them is not. `configured` is a boolean
 * for that reason and not a URL.
 *
 * It answers 200 while the database is absent, because an unconfigured
 * deployment is a state worth reporting, not treating as a fault. What it
 * must never do is answer 200 while a configured database is unreachable,
 * which is what the `database` field is for once there is a client to ask.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!configured()) {
    // Not a fault. A deployment without a database is the expected state for
    // one that has not been set up yet, and a monitor that goes red for it is
    // a monitor nobody reads by the second week.
    return answer({ ok: true, database: "absent" }, 200);
  }

  // The point of the daily cron: a query, so the project counts as active and
  // does not pause. Cheap on purpose — one row, one column, nobody's in
  // particular. The anon client rather than the service role, so this cannot be
  // a way to read anything: the policies apply, and an unauthenticated caller
  // sees only what a public profile has offered.
  const db = await serverClient();
  try {
    const { error } = await db!.from("profiles").select("id").limit(1);
    if (error) throw new Error(error.message);
    return answer({ ok: true, database: "reachable" }, 200);
  } catch (err) {
    // A 503 rather than a 200 with bad news in the body. This is the one case
    // that is genuinely wrong — configured and not answering — and a monitor
    // should not have to parse JSON to find that out.
    console.error("Health check: the database did not answer:", err);
    return answer({ ok: false, database: "unreachable" }, 503);
  }
}

/** No body ever says more than this, because nobody has to authenticate to read it. */
function answer(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
