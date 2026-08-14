/**
 * Set and era names, as URLs.
 *
 * Derived rather than stored, and that is the whole design decision. A set name
 * here is whatever its owner typed — the collection this app was built around
 * files Base Set under "Set 1 Unlimited", because a print run is a set to a
 * collector and not to a catalogue. Storing a slug beside it would mean two
 * spellings that can disagree, and the one in the URL would be the one nobody
 * ever looks at again.
 *
 * The cost is real and worth stating: rename a set in your collection and its
 * address changes with it. For a personal tool that is the honest behaviour —
 * the URL describes what the thing is called, and it was called something else
 * yesterday. It would be the wrong trade for a public catalogue with links
 * pointing at it from outside, and this is not one.
 */

/**
 * A name, folded down to something that survives an address bar.
 *
 * Accents come off rather than being percent-encoded, so "Pokémon" is `pokemon`
 * and not `pok%C3%A9mon` — the second is technically fine and unreadable, and
 * these URLs are meant to be looked at. Ampersands and every other punctuation
 * mark become the same separator, which is what makes "Sun & Moon" and
 * "Sun and Moon" *not* collide while "Sun & Moon" and "Sun  &  Moon" do, which
 * is the right way round.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The set a slug names, or undefined.
 *
 * First match in the collection's own order wins. Collisions are possible —
 * "Base Set" and "Base-Set" fold to the same thing — and this resolves them
 * deterministically rather than pretending they cannot happen: the collection
 * is sorted newest first, so the newer set answers to the shared address and
 * the older one becomes unreachable by URL while staying visible everywhere
 * else.
 *
 * That is a real if rare loss, and the alternative is worse: a numeric suffix
 * nobody can predict, or a stored slug that drifts from the name beside it.
 */
export function bySlug<T extends { name: string }>(items: T[], slug: string): T | undefined {
  const wanted = slug.toLowerCase();
  return items.find((item) => slugify(item.name) === wanted);
}
