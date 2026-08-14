import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Somebody else's credential, at rest.
 *
 * The only thing this encrypts is a Notion integration token in
 * public.connections, and the reason it is encrypted rather than stored plainly
 * is the shape of that table: it is readable by its owner through row level
 * security, which means a token in it is a token in every backup, every replica
 * and every query that gets logged with its result. RLS decides who may read
 * the row; it has nothing to say about where the row is copied to afterwards.
 *
 * The key lives in SECRETS_KEY, in the environment, which is the one place the
 * database cannot reach. That is the whole point: somebody who ends up with a
 * copy of the table has ciphertext, and the key is not in it.
 *
 * ── The format, and why it starts with a version ──────────────────────────
 *
 *   v1.<iv>.<tag>.<ciphertext>      all base64url
 *
 * AES-256-GCM, so the tag is not decoration: it is what makes a tampered
 * ciphertext fail loudly instead of decrypting into something else. A cipher
 * without authentication lets an attacker who can write to the row change what
 * comes out of it.
 *
 * The version prefix is what turns a key rotation into a migration rather than
 * a guess. Rotate the key without it and every stored secret becomes a string
 * nobody can tell apart from a corrupt one. With it, `v1` rows can be read with
 * the old key and rewritten as `v2`, one at a time, while the app keeps running.
 */

const VERSION = "v1";

/** AES-256 wants exactly this many bytes, and a short key is a silent downgrade. */
const KEY_BYTES = 32;
/** GCM's recommended nonce length. Longer is legal and worse. */
const IV_BYTES = 12;

/**
 * Read at call time rather than at import.
 *
 * A module-level check fires wherever the module is imported — proxy.ts
 * included, which is once per matched request — for an answer that cannot
 * change between them. The same argument lib/core/env.ts makes about its own
 * check, and the same reason it lives in instrumentation.ts instead.
 */
function key(): Buffer {
  const raw = process.env.SECRETS_KEY?.trim();
  if (!raw) throw new Error("SECRETS_KEY is not set: a connection cannot be stored.");

  // Hex because that is what `openssl rand -hex 32` produces, which is what
  // .env.example tells you to run. Accepting base64 as well would mean a
  // 32-character hex string — half a key — could be mistaken for a valid
  // base64 one and silently used.
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `SECRETS_KEY must be ${KEY_BYTES} bytes as hex (64 characters); got ${buf.length}.`,
    );
  }
  return buf;
}

/** Whether this deployment can hold a secret at all. */
export function sealingAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(
    ".",
  );
}

/**
 * Throws on anything that is not exactly what seal() produced with this key.
 *
 * Deliberately one error for every failure — wrong key, wrong version, tampered
 * tag, truncated string. The caller cannot do anything different with the
 * distinction, and telling them which part failed is telling an attacker which
 * part they got right.
 */
export function open(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("That stored secret is not readable.");
  }
  const [, iv, tag, body] = parts;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv!, "base64url"));
    decipher.setAuthTag(Buffer.from(tag!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("That stored secret is not readable.");
  }
}
