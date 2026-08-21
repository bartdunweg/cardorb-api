"use client";

import { SettingsSaid } from "@/components/custom/SettingsPanel";
import { Avatar } from "@/components/base/avatar/avatar";
import { FileTrigger } from "@/components/base/file-upload-trigger/file-upload-trigger";
import { useAvatarUpload } from "@/components/custom/useAvatarUpload";
import { untitledButton } from "@/components/custom/untitledButtonClasses";

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
      {/* Their <Avatar> at xl, which is size-14 — the 56px this already drew. */}
      <Avatar
        size="xl"
        src={avatarUrl}
        alt="Your avatar"
        initials={fallback.charAt(0).toUpperCase()}
        className="shrink-0"
      />
      <div>
        {/* Untitled UI's FileTrigger. It holds the hidden input itself and
            opens it from whatever single child it is given, so the control
            here is an ordinary <button> — which is what it always should have
            been.

            That retires a whole paragraph of workaround. The label wrapped an
            sr-only input, whose own :focus-visible outline landed on a clipped
            1px box and was therefore invisible, so the ring had to be borrowed
            from the input by the span beside it through
            `group-has-[:focus-visible]`. A real button has a real focus ring.

            It also retires the `e.target.value = ""` reset: FileTrigger clears
            the input before every click, so picking the same file twice in a
            row still fires. Same guarantee, one level down. */}
        <FileTrigger
          acceptedFileTypes={["image/png", "image/jpeg", "image/webp"]}
          onSelect={async (files) => {
            const file = files?.[0];
            if (!file) return;
            if (await upload(file)) onUploaded?.();
          }}
        >
          <button
            type="button"
            disabled={busy}
            className={untitledButton({
              color: "secondary",
              className: busy ? "opacity-55 cursor-not-allowed" : undefined,
            })}
          >
            {busy ? "Saving…" : avatarUrl ? "Change" : "Upload"}
          </button>
        </FileTrigger>
        {said && <SettingsSaid>{said}</SettingsSaid>}
      </div>
    </div>
  );
}
