/**
 * A placeholder, and deliberately not a design.
 *
 * The API is the product first: the iOS app can be built against it before any
 * of this exists, which is the whole reason the first commit is endpoints
 * rather than a shell. What replaces this page is its own piece of work, on its
 * own terms, and it is not a port of the portfolio's /cards.
 */
export default function Home() {
  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", padding: 32, lineHeight: 1.6 }}>
      <h1>binder</h1>
      <p>The collection lives behind these:</p>
      <ul>
        <li>
          <code>GET /api/v1/collection</code> the whole thing, grouped by set
        </li>
        <li>
          <code>GET /api/v1/cards/:tcgId</code> one card
        </li>
        <li>
          <code>GET /api/v1/fields</code> the database&rsquo;s select options, key required
        </li>
        <li>
          <code>POST /api/v1/cards</code> add a card, key required
        </li>
      </ul>
    </main>
  );
}
