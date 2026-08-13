import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Card from "../components/Card";
import SignInForm from "../components/SignInForm";
import { SESSION_COOKIE } from "../../lib/api/guard";
import { APP_NAME, PUBLIC_USERNAME } from "../../lib/core/config";

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
  searchParams: Promise<{ next?: string }>;
}) {
  const [jar, params] = await Promise.all([cookies(), searchParams]);
  // Only a path within this app, never an absolute URL. `next` arrives in the
  // query string, and following whatever it says would let a link from anywhere
  // bounce someone off this domain while wearing its name. The second test
  // rejects "//evil.example", which is a path by the first test's reckoning and
  // a protocol-relative URL to every browser.
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/cards";

  if (jar.get(SESSION_COOKIE)?.value) redirect(next);

  return (
    <section className="page-signin">
      <Card className="signin-card">
        {/* The heading says what this screen is for, not what the app is
            called. It was the name with a line under it explaining that you
            sign in to add to the collection — a title that named the product
            and a subtitle doing the title's job. One line says both. */}
        <h1 className="page-title">Sign in to {APP_NAME}</h1>
        <SignInForm redirectTo={next} defaultEmail={process.env.OWNER_EMAIL ?? ""} />

        {/* Something for the people this login is not for. Without it this
            address is a locked door with no sign, which is a strange thing to
            find at the end of a link someone shared.

            Inside the card now, under a rule. Floating below it, it read as an
            afterthought about the card rather than the second of two ways in;
            the rule says they are alternatives without a word like "or" doing
            the work. No icon: it is the only thing on this line and the label
            already says what it does.

            The plain .btn and not .btn--primary, because signing in is what
            this page is for and two filled buttons is a page asking twice. */}
        {/* Not aria-hidden, unlike a bare rule would be: "or" is the word that
            says these are two ways in rather than a step and then another. The
            lines beside it are drawn by the stylesheet, so what a screen reader
            gets is the word alone. */}
        <p className="signin-or">or</p>
        <Link href={`/user/${PUBLIC_USERNAME}`} className="btn signin-public">
          Public demo
        </Link>
      </Card>
    </section>
  );
}
