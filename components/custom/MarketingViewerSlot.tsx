import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/base/buttons/button";
import ViewerPill from "@/components/custom/ViewerPill";
import { navLink } from "@/components/custom/marketingClasses";
import { currentViewer } from "../../lib/api/viewer";
import { ownerLabel } from "../../lib/core/owner";

/**
 * The navbar's right-hand slot on the two public marketing pages, and the only
 * reason either of them touched a cookie.
 *
 * Why it is its own file, and why it is wrapped in Suspense.
 *
 * `/` and `/app/ios` are the two pages whose whole job is to be found. Both
 * awaited `currentViewer()` at the top of the page component, which reads
 * cookies — so Next could not render either statically. Measured against
 * production: `/privacy` (static) answered from the CDN with `age: 7213` and a
 * TTFB of 78–126 ms, while `/` and `/app/ios` returned
 * `private, no-cache, no-store` and a cache MISS every single time, at 154–193
 * ms. Every anonymous visitor and every crawler paid a cold server render plus
 * an auth lookup for a pill that a signed-out visitor never sees.
 *
 * Neither page declares `dynamic = "force-dynamic"`. They were dynamic purely
 * by consequence, which is the kind of cost nobody chose and nobody notices.
 *
 * **This does not fix that yet, and saying so is the point of this paragraph.**
 * Moving the await behind a Suspense boundary is what the fix needs, but on
 * Next 16 without Cache Components enabled a `cookies()` read anywhere in the
 * tree still makes the whole route dynamic — Suspense alone does not carve out
 * a static shell. Verified after the change: `npm run build` still marks
 * `/app/ios` `ƒ`, and neither route appears in `.next/prerender-manifest.json`.
 * Turning on `cacheComponents` is a project-wide migration with its own
 * adoption skill, and it would have to reckon with the two routes that are
 * `force-dynamic` for real reasons. That is its own change; see STATE.md.
 *
 * What this file is worth on its own, until then: the same fourteen lines of
 * navbar JSX had been written out twice and were free to disagree, and the
 * caching fix now needs one edit rather than three.
 *
 * The fallback is the signed-out state rather than a skeleton, deliberately: it
 * is what most visitors end on, so the common case never flickers.
 *
 * Note this is the opposite call from `app/user/[username]/page.tsx`, which is
 * `force-dynamic` on purpose (an ISR entry outlives the privacy switch that
 * should have killed it). That page has a reason; these two did not.
 */
async function ViewerSlot({ dashboardHref }: { dashboardHref: string }) {
  const viewer = await currentViewer();
  if (!viewer) return <SignedOut />;
  return (
    <ViewerPill href={dashboardHref} name={ownerLabel(viewer)} avatarUrl={viewer.avatarUrl} />
  );
}

/** Log in and Sign up. Also the fallback, for the reason in the note above. */
function SignedOut() {
  return (
    <>
      <Link href="/login" className={navLink}>
        Log in
      </Link>
      <Button href="/signup" size="lg">
        Sign up
      </Button>
    </>
  );
}

export default function MarketingViewerSlot({ dashboardHref }: { dashboardHref: string }) {
  return (
    <Suspense fallback={<SignedOut />}>
      <ViewerSlot dashboardHref={dashboardHref} />
    </Suspense>
  );
}
