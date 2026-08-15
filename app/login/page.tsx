import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInForm from "../components/SignInForm";
import SigninShell, { SigninNotice } from "../components/SigninShell";
import { currentViewer } from "../../lib/api/viewer";
import { APP_NAME } from "../../lib/core/config";

export const metadata: Metadata = {
  title: "Sign in",
  // Not just noindex, which it inherits from the layout: a login has nothing
  // for a crawler and a crawler following a link to one wastes the fetch. The
  // robots.txt beside it says the same thing a step earlier.
  robots: { index: false, follow: false },
};

/**
 * The way in.
 *
 * This used to be the root, back when the root was a door. It is not any more:
 * / is a page that says what this is, and it has a button pointing here. The
 * two were one screen and that screen could only be one of them — a landing
 * page with a password field on it is a locked door with a brochure taped to
 * it, and it was the door that won, which meant the one address anyone would
 * ever share had nothing on it to read.
 *
 * Signed in already, it goes straight through. That keeps the redirect this
 * page has always been for anyone who has been here before, and means the login
 * is only ever shown to someone who actually needs it.
 */
export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Only a path within this app, never an absolute URL. `next` arrives in the
  // query string, and following whatever it says would let a link from anywhere
  // bounce someone off this domain while wearing its name. The second test
  // rejects "//evil.example", which is a path by the first test's reckoning and
  // a protocol-relative URL to every browser.
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/cards";

  // Somebody already signed in has no business on a login, and sending them
  // where they were aiming is kinder than a form that would refuse their own
  // address. Read before the notice below is built, so a signed-in visitor
  // following a stale link is not shown a warning about it on their way past.
  if (await currentViewer()) redirect(next);

  /**
   * Why you are looking at this screen, when it was not your idea.
   *
   * /auth/confirm and /settings/password both send somebody here with a
   * sentence when their link has expired, and until now this page silently
   * dropped it: the person whose recovery link had run out got an ordinary
   * login with no explanation, which is the worst moment in the whole flow to
   * say nothing.
   *
   * Above the form rather than below it. A message under a form is a reaction
   * to what you just did; this one is context for what you are about to do.
   * Length-capped and rendered as text — it arrives in a query string, which is
   * to say from anywhere, and a sentence someone else chose is not something to
   * hand to a page unbounded.
   */
  const notice = params.error?.slice(0, 200) || null;

  return (
    // The heading says what this screen is for, not what the app is called.
    // It was the name with a line under it explaining that you sign in to add
    // to the collection — a title that named the product and a subtitle doing
    // the title's job. One line says both.
    <SigninShell title={`Sign in to ${APP_NAME}`}>
      {/* role="status" and not "alert": this is here as the page loads rather
          than in response to anything, and alert interrupts a screen reader
          for something the reader is already on their way to. */}
      {notice && <SigninNotice role="status">{notice}</SigninNotice>}

      <SignInForm redirectTo={next} layout="column" />
    </SigninShell>
  );
}
