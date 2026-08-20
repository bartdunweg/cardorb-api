import Link from "next/link";

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
        border border-[var(--color-border)] text-primary no-underline whitespace-nowrap
        overflow-hidden text-ellipsis [font-family:var(--font-body)] [font-size:var(--fs-small)]
        [transition:border-color_var(--dur-fast)_var(--ease-smooth)]
        hover:border-[var(--color-border-hover)]"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not one of the catalogue CDNs next/image is configured for.
        <img
          src={avatarUrl}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 shrink-0 aspect-square rounded-full object-cover border border-[var(--color-border-subtle)]"
        />
      ) : (
        // No avatar uploaded yet — a circle with the first letter of the name,
        // same fallback as settings/profile.
        <span
          className="grid place-items-center w-6 h-6 shrink-0 aspect-square rounded-full bg-[var(--color-bg-grouped)]
            border border-[var(--color-border-subtle)] text-tertiary
            [font-family:var(--font-main)] [font-size:var(--fs-tiny)] [font-weight:var(--fw-title)]"
          aria-hidden="true"
        >
          {name.charAt(0)}
        </span>
      )}
      {/* Capped, because a display name is allowed 60 characters and this bar
          is 390px wide on a phone: uncapped, one long name squeezed the
          wordmark until "Card Orb" wrapped onto two lines. Past the cap the
          name ellipsizes; the whole of it is still in the link's aria-label. */}
      <span className="min-w-0 max-w-[min(45vw,220px)] overflow-hidden text-ellipsis">{name}</span>
    </Link>
  );
}
