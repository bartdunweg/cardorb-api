import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Card from "./components/Card";
import SignInForm from "./components/SignInForm";
import { SESSION_COOKIE } from "../lib/api/guard";
import { PUBLIC_USERNAME } from "../lib/core/config";

export const metadata: Metadata = {
  title: "binder",
};

/**
 * The way in.
 *
 * This was a redirect to /cards, from when there was one screen and everyone
 * saw it. There are two now: /cards is the collection you manage, behind the
 * key, and /user/<name> is the one you hand to someone. So the root is the
 * door, and it says which of the two you are looking for.
 *
 * Signed in already, it goes straight through. That keeps the redirect this
 * page used to be for anyone who has been here before, and means the login is
 * only ever shown to someone who actually needs it.
 */
export const dynamic = "force-dynamic";

export default async function Home({
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
        <h1 className="page-title">binder</h1>
        <SignInForm
          redirectTo={next}
          note="A collection of Pokémon cards. Sign in to add to it."
        />
      </Card>

      {/* Something for the people this login is not for. Without it the root of
          the app is a locked door with no sign, which is a strange thing to
          find at the end of a link someone shared.

          A button rather than a sentence with a link in it: for anyone without
          the password this is not a footnote, it is the only thing on the page
          they can do. It is the plain .btn and not .btn--primary, because the
          filled one is Sign in and two of those would be a page asking twice. */}
      <Link href={`/user/${PUBLIC_USERNAME}`} className="btn signin-public">
        <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>See the collection</span>
      </Link>
    </section>
  );
}
