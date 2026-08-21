import Link from "next/link";
import { Avatar } from "@/components/base/avatar/avatar";

/**
 * Who is signed in, in a public page's navbar.
 *
 * It used to be a bare link reading "Signed in as {name}" — a sentence sitting
 * in the slot that holds a text link and a button when nobody is signed in, so
 * the two states of the same corner looked structurally different and the
 * signed-in one did not look clickable. It is a pill now, with the same light
 * grey edge a control wears, and the words are gone: the avatar beside the name
 * already says what they said.
 *
 * Gone from the visible text, not gone. The link's accessible name still opens
 * with "Signed in as", because a screen reader has no avatar to look at.
 *
 * A component rather than another string in ./marketingClasses, which holds
 * typography: what the two marketing pages share here is structure.
 */
export default function ViewerPill({
  href,
  name,
  avatarUrl,
}: {
  href: string;
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <Link
      href={href}
      aria-label={`Signed in as ${name} — open dashboard`}
      className="inline-flex items-center gap-2 min-w-0 pl-1 pr-3 py-1 rounded-full
        border border-secondary text-primary no-underline whitespace-nowrap
        overflow-hidden text-ellipsis font-body text-xs
        transition-colors duration-150 ease-out
        hover:border-primary"
    >
      {/* Their <Avatar>, which carries the initial fallback this used to build
          by hand as a second branch. `xs` is size-6, the 24px this already was. */}
      <Avatar size="xs" src={avatarUrl} alt="" initials={name.charAt(0)} className="shrink-0" />
      {/* Capped, because a display name is allowed 60 characters and this bar
          is 390px wide on a phone: uncapped, one long name squeezed the
          wordmark until "Card Orb" wrapped onto two lines. Past the cap the
          name ellipsizes; the whole of it is still in the link's aria-label. */}
      <span className="min-w-0 max-w-[min(45vw,220px)] overflow-hidden text-ellipsis">{name}</span>
    </Link>
  );
}
