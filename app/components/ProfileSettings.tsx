"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_URL } from "../../lib/core/config";
import { MAX_DISPLAY_NAME } from "../../lib/core/account";
import { ownerLabel } from "../../lib/core/owner";
import {
  SettingsHint,
  SettingsInput,
  SettingsLink,
  SettingsPanel,
  SettingsPanelTitle,
  SettingsPanels,
  SettingsSaid,
  SettingsSwitch,
  settingsLinkAnchorClassName,
} from "./SettingsPanel";

/**
 * The profile screen, and the switch that turns a whole feature on.
 *
 * `is_public` defaults to false because the migration argues sharing is
 * something you do rather than something that happens to you. The consequence
 * was that /user/<name> — the public page, its OG image, its JSON-LD, the
 * price-stripping that makes it safe to share — was unreachable for every
 * account whose row had not been edited by hand. All of it built, none of it
 * switched on.
 *
 * Each control saves on its own rather than behind one Save button. Three
 * fields with one button means changing your name and flipping the switch are
 * the same action, and a failure of either has to explain which half did not
 * happen. Saving separately means every message is about one thing.
 */
export default function ProfileSettings({
  initial,
}: {
  initial: { username: string; displayName: string | null; isPublic: boolean; avatarUrl: string | null };
}) {
  const router = useRouter();

  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [username, setUsername] = useState(initial.username);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);

  const [saying, setSaying] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const say = (field: string, message: string | null) =>
    setSaying((s) => ({ ...s, [field]: message }));

  async function patch(field: string, body: Record<string, unknown>) {
    setBusy(field);
    say(field, null);
    try {
      const res = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        say(field, data.error ?? "That could not be saved.");
        return false;
      }
      say(field, "Saved.");
      router.refresh();
      return true;
    } catch {
      say(field, "No answer from the server.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    const wanted = username.trim().toLowerCase();
    if (wanted === initial.username) return;
    setBusy("username");
    say("username", null);
    try {
      const res = await fetch("/api/v1/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: wanted }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        say("username", data.error ?? "That name could not be claimed.");
        return;
      }
      say("username", "Saved.");
      router.refresh();
    } catch {
      say("username", "No answer from the server.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * A picked file, drawn onto a canvas at avatar size and read back out as a
   * PNG data URL. Resizing before it ever reaches the network is what keeps
   * a phone photo (routinely 4000px, several MB) under the route's 2MB cap
   * without the server needing an image-processing dependency just to reject
   * or shrink one.
   */
  async function pickAvatar(file: File) {
    setBusy("avatar");
    say("avatar", null);
    try {
      const bitmap = await createImageBitmap(file);
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      // Cover-crop to a square: the shorter side fills the frame, the longer
      // side's overflow is cut evenly from both edges, so a rectangular photo
      // does not get squashed into a circle later.
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - side) / 2;
      const sy = (bitmap.height - side) / 2;
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
      const dataUrl = canvas.toDataURL("image/png");

      const res = await fetch("/api/v1/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; avatarUrl?: string };
      if (!res.ok) {
        say("avatar", data.error ?? "That image could not be saved.");
        return;
      }
      setAvatarUrl(data.avatarUrl ?? null);
      say("avatar", "Saved.");
      router.refresh();
    } catch {
      say("avatar", "That image could not be read.");
    } finally {
      setBusy(null);
    }
  }

  const link = `${SITE_URL}/user/${initial.username}`;

  return (
    <SettingsPanels>
      <SettingsPanel>
        <SettingsPanelTitle>Avatar</SettingsPanelTitle>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not one of the catalogue CDNs next/image is configured for.
            <img
              src={avatarUrl}
              alt="Your avatar"
              width={56}
              height={56}
              className="w-14 h-14 shrink-0 aspect-square rounded-full object-cover border border-[var(--color-border-subtle)]"
            />
          ) : (
            <span
              className="grid place-items-center w-14 h-14 shrink-0 aspect-square rounded-full bg-[var(--color-bg-grouped)]
                border border-[var(--color-border-subtle)] text-label-tertiary
                [font-family:var(--font-main)] [font-size:var(--fs-card)] [font-weight:var(--fw-title)]"
              aria-hidden="true"
            >
              {(displayName || initial.username).charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            {/* The input is sr-only, so its own :focus-visible outline lands
                on a clipped 1px box — invisible. group on the label,
                group-has-[:focus-visible] on the visible span (same pattern
                as AppearanceSettings.tsx/SettingsPanel.tsx's other
                hidden-input controls — Tailwind's group-has-* variant is a
                descendant selector, so it has to land on a child of .group,
                not .group itself) puts the ring where a keyboard user can
                actually see it. */}
            <label className="group cursor-pointer">
              <span
                className={`btn group-has-[:focus-visible]:[outline:2px_solid_var(--color-label)]
                  group-has-[:focus-visible]:[outline-offset:2px]${busy === "avatar" ? " opacity-55 cursor-not-allowed" : ""}`}
              >
                {busy === "avatar" ? "Saving…" : avatarUrl ? "Change" : "Upload"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy === "avatar"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickAvatar(file);
                }}
              />
            </label>
            {saying.avatar && <SettingsSaid>{saying.avatar}</SettingsSaid>}
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelTitle>Your link</SettingsPanelTitle>

        {/* A real checkbox with a label, styled as a switch. role="switch" on a
            div would need its own key handling and its own focus ring; a
            checkbox arrives with both, and screen readers announce the state
            without being told to. */}
        <SettingsSwitch
          checked={isPublic}
          disabled={busy === "isPublic"}
          onChange={async (e) => {
            const next = e.target.checked;
            setIsPublic(next);
            // Put back if the server disagreed, so the switch never shows a
            // state the database does not hold.
            if (!(await patch("isPublic", { isPublic: next }))) setIsPublic(!next);
          }}
        >
          <strong className="block text-label font-medium">
            Anyone with the link can see my collection
          </strong>
          <SettingsHint>Prices are never shown on the public page, whatever this says.</SettingsHint>
        </SettingsSwitch>

        {isPublic ? (
          <SettingsLink>
            <a href={link} target="_blank" rel="noreferrer" className={settingsLinkAnchorClassName}>
              {link.replace(/^https?:\/\//, "")}
            </a>
          </SettingsLink>
        ) : (
          <SettingsHint>
            While this is off, that address answers 404 — the same answer as a
            name nobody has taken, so it cannot be used to find out you are here.
          </SettingsHint>
        )}
        {saying.isPublic && <SettingsSaid>{saying.isPublic}</SettingsSaid>}
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelTitle>Your name</SettingsPanelTitle>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await patch("displayName", { displayName });
          }}
        >
          {/* The placeholder is the fallback, not a suggestion: ownerLabel()
              in lib/core/owner.ts resolves an empty name to exactly this, so
              the field previews what the public page will say. */}
          <SettingsInput
            value={displayName}
            maxLength={MAX_DISPLAY_NAME}
            placeholder={initial.username}
            onChange={(e) => setDisplayName(e.target.value)}
            // The panel's heading is what sighted people read as this field's
            // name; a heading is not an accessible name, so it is said again.
            aria-label="Your name"
            aria-describedby="display-name-hint"
          />
          {/* Built from `initial`, not from the live field. This element is the
              input's aria-describedby, and a description that changes on every
              keystroke is one a screen reader may read back on every keystroke.
              So it shows what the page is called now and the placeholder above
              shows what an empty field falls back to; neither moves while
              somebody is typing into the box they describe. */}
          <SettingsHint id="display-name-hint">
            What your collection is called: &ldquo;
            {ownerLabel(initial)}&rsquo;s Pok&eacute;mon card collection&rdquo;. Empty means your
            username.
          </SettingsHint>
          <button className="btn" type="submit" disabled={busy === "displayName"}>
            {busy === "displayName" ? "Saving…" : "Save"}
          </button>
          {saying.displayName && <SettingsSaid>{saying.displayName}</SettingsSaid>}
        </form>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelTitle>Username</SettingsPanelTitle>
        <form onSubmit={saveUsername}>
          <SettingsInput
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            spellCheck={false}
            autoCapitalize="none"
            aria-label="Username"
            aria-describedby="username-hint"
          />
          <SettingsHint id="username-hint">
            Two to thirty characters: lowercase letters, numbers and hyphens.
            Changing it changes your link, and the old one stops working.
          </SettingsHint>
          <button
            className="btn"
            type="submit"
            disabled={busy === "username" || username.trim().toLowerCase() === initial.username}
          >
            {busy === "username" ? "Saving…" : "Save"}
          </button>
          {saying.username && <SettingsSaid>{saying.username}</SettingsSaid>}
        </form>
      </SettingsPanel>
    </SettingsPanels>
  );
}
