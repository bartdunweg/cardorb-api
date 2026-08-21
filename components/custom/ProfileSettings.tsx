"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_URL } from "@/lib/core/config";
import { MAX_DISPLAY_NAME } from "@/lib/core/account";
import { ownerLabel } from "@/lib/core/owner";
import AvatarPicker from "@/components/custom/AvatarPicker";
import { useUsernameCheck, usernameSays } from "@/components/custom/useUsernameCheck";
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
} from "@/components/custom/SettingsPanel";
import Button from "@/components/custom/Button";

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
  initial: {
    username: string;
    displayName: string | null;
    isPublic: boolean;
    avatarUrl: string | null;
  };
}) {
  const router = useRouter();

  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [username, setUsername] = useState(initial.username);

  const wanted = username.trim().toLowerCase();
  const nameChanged = wanted !== initial.username;
  const name = useUsernameCheck(username, initial.username);
  const says = usernameSays(name, wanted);

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
        <SettingsPanelTitle>Avatar</SettingsPanelTitle>
        {/* The picture, the button and what happened are AvatarPicker's, shared
            with the welcome flow's avatar step. Refreshing afterwards is this
            screen's own business: the tab bar draws the avatar out of the
            layout's viewer, which is server state this page cannot set. */}
        <AvatarPicker
          initial={initial.avatarUrl}
          fallback={displayName || ownerLabel(initial)}
          onUploaded={() => router.refresh()}
        />
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
          <strong className="block text-primary font-medium">
            Anyone with the link can see my collection
          </strong>
          <SettingsHint>
            Prices are never shown on the public page, whatever this says.
          </SettingsHint>
        </SettingsSwitch>

        {isPublic ? (
          <SettingsLink>
            <a href={link} target="_blank" rel="noreferrer" className={settingsLinkAnchorClassName}>
              {link.replace(/^https?:\/\//, "")}
            </a>
          </SettingsLink>
        ) : (
          <SettingsHint>
            While this is off, that address answers 404 — the same answer as a name nobody has
            taken, so it cannot be used to find out you are here.
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
          <Button type="submit" disabled={busy === "displayName"}>
            {busy === "displayName" ? "Saving…" : "Save"}
          </Button>
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
            Two to thirty characters: lowercase letters, numbers and hyphens. Changing it changes
            your link, and the old one stops working.
          </SettingsHint>
          {/* Whether the name is free, while it is still being typed — the same
              check the welcome flow makes, and for the same reason: being told
              after pressing Save that somebody else has the name is the one
              thing this screen can cheaply avoid. The database still decides;
              see useUsernameCheck.ts. Always mounted so the live region
              announces its changes rather than its insertion. */}
          <SettingsSaid aria-live="polite">{says ?? ""}</SettingsSaid>
          <Button
            type="submit"
            disabled={busy === "username" || !nameChanged || name.kind === "taken"}
          >
            {busy === "username" ? "Saving…" : "Save"}
          </Button>
          {saying.username && <SettingsSaid>{saying.username}</SettingsSaid>}
        </form>
      </SettingsPanel>
    </SettingsPanels>
  );
}
