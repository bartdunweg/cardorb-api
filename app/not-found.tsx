import Link from "next/link";
import Card from "./components/Card";

/**
 * What a URL that is not a page looks like.
 *
 * There was none, so every notFound() in the app fell through to the framework
 * default: a bare white page in Times New Roman, which reads as the site being
 * broken rather than the address being wrong.
 *
 * At the root, so it answers for every route that has no closer boundary of its
 * own — a mistyped card id, a username that is not the one, anything at all.
 * It uses the same card shell as the login rather than the collection's layout,
 * because a 404 is a door too: it is somewhere you arrive without being signed
 * in, and it should not imply a collection is behind it.
 */
export default function NotFound() {
  return (
    <section className="page-signin">
      <Card className="signin-card">
        <h1 className="page-title">Not found</h1>
        <p className="signin-note">
          That address does not lead anywhere. It may have been a card that is no longer in the
          collection.
        </p>
        <p aria-hidden="true" className="signin-or">
          or
        </p>
        <Link href="/" className="btn signin-public">
          Go to binder
        </Link>
      </Card>
    </section>
  );
}
