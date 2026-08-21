"use client";

import { SettingsSaid } from "./SettingsPanel";
import { useAvatarUpload } from "./useAvatarUpload";
import { untitledButton } from "./untitledButtonClasses";

/**
 * The avatar, and the one control that changes it.
 *
 * The picture beside a button, used by Settings > Profile and by the welcome
 * flow's avatar step. Both need the same three things — what is there now, a
 * way to replace it, and what happened — so they are one component rather than
 * two that agree by hand today and disagree after the next edit.
 *
 * The upload itself is useAvatarUpload; this is only its face.
 */
export default function AvatarPicker({
  initial,
  /** Drawn when there is no picture: the first letter of a display name or a
   *  username, never an empty circle. */
  fallback,
  onUploaded,
}: {
  initial: string | null;
  fallback: string;
  /** Called after a successful save, for whatever the screen has to do about
   *  it — the settings screen refreshes so the tab bar picks the new one up. */
  onUploaded?: () => void;
}) {
  const { upload, avatarUrl, busy, said } = useAvatarUpload(initial);

  return (
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
            border border-[var(--color-border-subtle)] text-tertiary
            font-body text-display-xs font-medium"
          aria-hidden="true"
        >
          {fallback.charAt(0).toUpperCase()}
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
            className={untitledButton({
              color: "secondary",
              className: `group-has-[:focus-visible]:[outline:2px_solid_var(--color-label)]
                group-has-[:focus-visible]:outline-offset-2${busy ? " opacity-55 cursor-not-allowed" : ""}`,
            })}
          >
            {busy ? "Saving…" : avatarUrl ? "Change" : "Upload"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              // Cleared before the await, so picking the same file twice in a
              // row still fires a change event the second time.
              e.target.value = "";
              if (!file) return;
              if (await upload(file)) onUploaded?.();
            }}
          />
        </label>
        {said && <SettingsSaid>{said}</SettingsSaid>}
      </div>
    </div>
  );
}
