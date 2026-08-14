/**
 * A small label chip: a rarity on a card, a genre on a record.
 *
 * A primitive, not a route component. It owns the shape a chip has everywhere
 * on the site (a pill, one line, never wrapped mid-label) and nothing about how
 * any particular page dresses it. /cards and /favorites deliberately look
 * different: the collection's chips are dense and sit under a scan at 11px, the
 * favourites' are quieter and sit under a cover at the body size. So the colour,
 * the size and the edge come from a class the route passes in.
 *
 * That split is the same one the two routes make everywhere else: they share the
 * design system and not each other's layout, so the thing that gets shared is
 * the piece, not the styling.
 */
export default function Tag({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const base = "py-[2px] px-2 rounded-pill [font-family:var(--font-body)] leading-normal whitespace-nowrap";
  return <span className={[base, className].filter(Boolean).join(" ")}>{children}</span>;
}
