import type { Metadata } from "next";
import Link from "next/link";

/**
 * The index, and a real screen rather than a redirect.
 *
 * A redirect would mean the address the navigation points at is not a place —
 * you would press Settings and land on Profile, with no way to see what else
 * there is. Four lines that say what each section holds is the whole job.
 */
export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/settings/profile",
    title: "Profile",
    blurb: "Your name, your link, and whether anyone else can open it.",
  },
  {
    href: "/settings/account",
    title: "Account",
    blurb: "Email address, password, and deleting everything.",
  },
  {
    href: "/settings/import",
    title: "Import",
    blurb: "Bring a collection in from a spreadsheet or from Notion.",
  },
  {
    href: "/settings/appearance",
    title: "Appearance",
    blurb: "Light, dark, or whatever this device is set to.",
  },
];

export default function SettingsIndex() {
  return (
    <ul className="settings-list" role="list">
      {SECTIONS.map((s) => (
        <li key={s.href}>
          <Link href={s.href} className="settings-row">
            <span className="settings-row-title">{s.title}</span>
            <span className="settings-row-blurb">{s.blurb}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
