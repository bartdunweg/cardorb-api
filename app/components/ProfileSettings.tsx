"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_URL } from "../../lib/core/config";
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
  initial: { username: string; displayName: string | null; isPublic: boolean };
}) {
  const router = useRouter();

  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [username, setUsername] = useState(initial.username);

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

  const link = `${SITE_URL}/user/${initial.username}`;

  return (
    <SettingsPanels>
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
        <SettingsPanelTitle>Display name</SettingsPanelTitle>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await patch("displayName", { displayName });
          }}
        >
          <SettingsInput
            value={displayName}
            maxLength={60}
            placeholder={initial.username}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-describedby="display-name-hint"
          />
          <SettingsHint id="display-name-hint">
            What the public page calls you. Empty means your username.
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
