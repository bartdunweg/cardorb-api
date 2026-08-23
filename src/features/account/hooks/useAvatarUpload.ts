"use client";

import { useState } from "react";

/**
 * Picking an avatar: resize in the browser, then post it.
 *
 * Extracted from ProfileSettings so the welcome flow's avatar step is the same
 * upload rather than a second one that drifts. Two screens both needing "crop
 * to a square, 256px, PNG data URL" is exactly the case where a copy would end
 * up with a different size on one of them and nobody would notice which.
 *
 * The resize is the point of doing this on the client at all. A phone photo is
 * routinely 4000px and several megabytes; the route caps a body at 2MB, so
 * without this the honest camera-roll case fails. Sending a canvas-shrunk PNG
 * means the server never needs an image-processing dependency just to shrink
 * or reject one.
 */
export type AvatarUpload = {
  /** Take a picked file all the way to a saved avatar. True when it was
   *  saved — the caller may have work of its own to do then, and reading
   *  `avatarUrl` from the closure it was called in would give it the value
   *  from before this call. */
  upload: (file: File) => Promise<boolean>;
  /** Clear the saved avatar. True when it was removed, like `upload`. */
  remove: () => Promise<boolean>;
  /** The saved URL, kept here so a screen can render it without a refresh. */
  avatarUrl: string | null;
  busy: boolean;
  /** The one-line result of the last attempt, or null before there was one. */
  said: string | null;
};

export function useAvatarUpload(initial: string | null): AvatarUpload {
  const [avatarUrl, setAvatarUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function upload(file: File): Promise<boolean> {
    setBusy(true);
    setSaid(null);
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
        setSaid(data.error ?? "That image could not be saved.");
        return false;
      }
      setAvatarUrl(data.avatarUrl ?? null);
      setSaid("Saved.");
      return true;
    } catch {
      setSaid("That image could not be read.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<boolean> {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/v1/profile/avatar", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaid(data.error ?? "That could not be removed.");
        return false;
      }
      setAvatarUrl(null);
      setSaid("Removed.");
      return true;
    } catch {
      setSaid("No answer from the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { upload, remove, avatarUrl, busy, said };
}
