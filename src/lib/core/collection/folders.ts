/**
 * What a folder may be called. One field, so the whole validation is here
 * rather than in two route handlers that would drift.
 */
export const FOLDER_NAME_MAX = 60;

export function validateFolderName(
  value: unknown,
): { kind: "ok"; name: string } | { kind: "invalid"; error: string } {
  if (typeof value !== "string") return { kind: "invalid", error: "A folder needs a name." };
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { kind: "invalid", error: "A folder needs a name." };
  if (name.length > FOLDER_NAME_MAX)
    return { kind: "invalid", error: `A folder name is at most ${FOLDER_NAME_MAX} characters.` };
  return { kind: "ok", name };
}
