"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALE } from "../../lib/core/config";
import {
  SettingsHint,
  SettingsInput,
  SettingsPanel,
  SettingsPanelTitle,
  SettingsPanels,
  SettingsSaid,
} from "./SettingsPanel";

/**
 * Bringing a collection in, from a spreadsheet or from Notion.
 *
 * Both paths are two steps, and the first step writes nothing. That is not
 * caution for its own sake: the column mapping for a CSV is a *guess*, and an
 * import that acted on a guess without showing it would file two thousand cards
 * under the wrong set and look like it worked. The preview is where the guess
 * is checked by the only party who can check it.
 *
 * Both are also idempotent, and the screen says so, because "what happens if I
 * press it twice" is the question that stops people pressing it once.
 */

type Preview = {
  seen: number;
  added: number;
  skipped: number;
  sample: { name: string; number: string; setName: string; rarity: string | null; owned: boolean }[];
  header?: string[];
  skippedRows?: { line: number; why: string }[];
};

type Run = {
  id: string;
  kind: string;
  status: string;
  rows_seen: number;
  rows_added: number;
  rows_skipped: number;
  error: string | null;
  started_at: string;
};

export default function ImportSettings({
  connection,
  history,
}: {
  connection: { database_id: string; last_import_at: string | null; last_error: string | null } | null;
  history: Run[];
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState<string | null>(null);
  const [csvName, setCsvName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [source, setSource] = useState<"csv" | "notion" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [database, setDatabase] = useState("");

  const n = (v: number) => v.toLocaleString(LOCALE);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function look(kind: "csv" | "notion") {
    setBusy(kind);
    setSaid(null);
    setPreview(null);
    const { res, data } = await post(
      kind === "csv" ? "/api/v1/import/csv" : "/api/v1/import/notion",
      kind === "csv" ? { csv } : {},
    );
    setBusy(null);
    if (!res.ok) return setSaid((data.error as string) ?? "That could not be read.");
    setSource(kind);
    setPreview(data as unknown as Preview);
  }

  async function run() {
    if (!source) return;
    setBusy("commit");
    setSaid(null);
    const { res, data } = await post(
      source === "csv" ? "/api/v1/import/csv" : "/api/v1/import/notion",
      source === "csv" ? { csv, commit: true } : { commit: true },
    );
    setBusy(null);
    if (!res.ok) return setSaid((data.error as string) ?? "That import did not finish.");
    const added = data.added as number;
    setPreview(null);
    setSaid(
      added === 0
        ? "Nothing new — everything in there was already in your collection."
        : `${n(added)} ${added === 1 ? "card" : "cards"} added.`,
    );
    router.refresh();
  }

  // Monospace-ish numbers so the line numbers in a skipped-rows list line up
  // with each other rather than drifting.
  const listClass = "list-none my-3 p-0 grid gap-1 [font-size:var(--fs-small)]";

  return (
    <SettingsPanels>
      <SettingsPanel>
        <SettingsPanelTitle>From a spreadsheet</SettingsPanelTitle>
        <SettingsHint>
          A CSV with a column for the card name and one for the set. Anything
          else — number, rarity, types, the date you got it — is used if it is
          there. A row with no “owned” column counts as owned.
        </SettingsHint>

        <SettingsInput
          ref={file}
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setCsvName(f.name);
            setCsv(await f.text());
            setPreview(null);
            setSaid(null);
          }}
        />

        <button
          className="btn"
          type="button"
          disabled={!csv || busy === "csv"}
          onClick={() => look("csv")}
        >
          {busy === "csv" ? "Reading…" : csvName ? `Check ${csvName}` : "Check the file"}
        </button>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelTitle>From Notion</SettingsPanelTitle>

        {connection ? (
          <>
            <SettingsHint>
              Connected to <code>{connection.database_id.slice(0, 8)}…</code>
              {connection.last_import_at
                ? ` — last imported ${new Date(connection.last_import_at).toLocaleDateString(LOCALE)}.`
                : " — not imported yet."}
            </SettingsHint>
            {connection.last_error && <SettingsSaid>Last attempt failed: {connection.last_error}</SettingsSaid>}
            <SettingsHint>
              Running it again only brings in pages that are not here yet, so it
              is safe to press whenever you have added cards over there.
            </SettingsHint>
            <button className="btn" type="button" disabled={busy === "notion"} onClick={() => look("notion")}>
              {busy === "notion" ? "Reading…" : "Check for new cards"}
            </button>{" "}
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await fetch("/api/v1/connections/notion", { method: "DELETE" });
                router.refresh();
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("connect");
              setSaid(null);
              const { res, data } = await post("/api/v1/connections/notion", { token, database });
              setBusy(null);
              if (!res.ok) return setSaid((data.error as string) ?? "That could not be connected.");
              setToken("");
              router.refresh();
            }}
          >
            <SettingsHint>
              Create an integration at notion.so/my-integrations, share your card
              database with it, then paste the token and the database link here.
              The token is encrypted before it is stored.
            </SettingsHint>
            <SettingsInput
              type="password"
              placeholder="ntn_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <SettingsInput
              placeholder="https://notion.so/…"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              autoComplete="off"
            />
            <button className="btn" type="submit" disabled={busy === "connect" || !token || !database}>
              {busy === "connect" ? "Checking…" : "Connect"}
            </button>
          </form>
        )}
      </SettingsPanel>

      {preview && (
        <SettingsPanel>
          <SettingsPanelTitle>What this would bring in</SettingsPanelTitle>
          <SettingsHint>
            {n(preview.seen)} rows read
            {preview.skipped ? `, ${n(preview.skipped)} skipped` : ""}. Nothing has
            been written yet.
          </SettingsHint>

          {preview.skippedRows?.length ? (
            <ul className={`${listClass} text-label-tertiary tabular-nums`}>
              {preview.skippedRows.slice(0, 5).map((s) => (
                <li key={s.line}>
                  Line {s.line}: {s.why}
                </li>
              ))}
            </ul>
          ) : null}

          <ul className={`${listClass} text-label-secondary`}>
            {preview.sample.map((c, i) => (
              <li key={i}>
                <strong className="text-label font-medium">{c.name}</strong> — {c.setName}{" "}
                {c.number}
                {c.rarity ? ` · ${c.rarity}` : ""} · {c.owned ? "in the binder" : "wanted"}
              </li>
            ))}
          </ul>

          <button className="btn btn--primary" type="button" disabled={busy === "commit"} onClick={run}>
            {busy === "commit" ? "Importing…" : "Import these"}
          </button>
        </SettingsPanel>
      )}

      {said && <SettingsSaid>{said}</SettingsSaid>}

      {history.length > 0 && (
        <SettingsPanel>
          <SettingsPanelTitle>Earlier imports</SettingsPanelTitle>
          <ul className={`${listClass} text-label-secondary tabular-nums`}>
            {history.map((r) => (
              <li key={r.id}>
                {new Date(r.started_at).toLocaleDateString(LOCALE)} · {r.kind} ·{" "}
                {r.status === "done"
                  ? `${n(r.rows_added)} added of ${n(r.rows_seen)}`
                  : r.status === "failed"
                    ? `failed — ${r.error ?? "no reason recorded"}`
                    : "still running"}
              </li>
            ))}
          </ul>
        </SettingsPanel>
      )}
    </SettingsPanels>
  );
}
