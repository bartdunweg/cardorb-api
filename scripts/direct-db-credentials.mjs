#!/usr/bin/env node
/**
 * Gives the `cardorb_direct` role a password and writes the pooler URL for Vercel, without the
 * password ever reaching a log. docs/direct-db.md has the steps around it.
 *
 *   node scripts/direct-db-credentials.mjs '<transaction pooler string from the dashboard>'
 *
 * The argument is the dashboard's string as shown, `[YOUR-PASSWORD]` and all: only its host, port
 * and project ref are used. The script
 *
 * 1. makes a random password (32 bytes, URL-safe, so the URL needs no escaping);
 * 2. prints an `alter role` statement carrying its SCRAM-SHA-256 verifier, not the password, for
 *    the SQL editor. The editor and pg_stat_statements keep what they run; a verifier of a random
 *    32-byte password is no use to anyone who reads it there;
 * 3. writes `postgresql://cardorb_direct.<ref>:<password>@<host>:<port>/postgres` to a file only
 *    you can read, and prints the `vercel env add` line that reads it and deletes it.
 *
 * Run again to rotate: a new password, a new statement, a new file.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROLE = "cardorb_direct";

/**
 * The verifier Postgres stores for `password` under SCRAM-SHA-256 (RFC 5802/7677), in the form
 * `alter role ... password` accepts as already hashed.
 */
export function scramVerifier(password, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/** Host, port and project ref out of the dashboard's transaction pooler string. */
export function poolerParts(dashboardString) {
  const u = new URL(dashboardString.replace("[YOUR-PASSWORD]", "x"));
  const ref = decodeURIComponent(u.username).split(".")[1];
  if (!ref || !/^[a-z0-9]+$/.test(ref)) {
    throw new Error(
      "Expected a user like postgres.<project-ref>: copy the Transaction pooler string",
    );
  }
  if (!u.hostname.endsWith(".pooler.supabase.com")) {
    throw new Error("Expected a *.pooler.supabase.com host: copy the Transaction pooler string");
  }
  return { host: u.hostname, port: u.port || "6543", ref };
}

export function directUrl({ host, port, ref }, password) {
  return `postgresql://${ROLE}.${ref}:${password}@${host}:${port}/postgres`;
}

const main = () => {
  const [dashboardString] = process.argv.slice(2);
  if (!dashboardString) {
    console.error("Usage: node scripts/direct-db-credentials.mjs '<transaction pooler string>'");
    process.exit(1);
  }
  const parts = poolerParts(dashboardString);
  if (parts.port !== "6543") {
    console.error(`Port ${parts.port} is not the transaction pooler (6543); carrying on with it.`);
  }
  const password = randomBytes(32).toString("base64url");
  const dir = mkdtempSync(join(tmpdir(), "cardorb-direct-"));
  const file = join(dir, "url");
  writeFileSync(file, directUrl(parts, password), { mode: 0o600 });

  console.log("1. Run this in the Supabase SQL editor (project", `${parts.ref}):\n`);
  console.log(`alter role ${ROLE} with password '${scramVerifier(password)}';\n`);
  console.log("2. Then, in the cardorb-api checkout:\n");
  console.log(
    `vercel env add DATABASE_POOLER_URL production --sensitive --project cardorb-api < ${file} && rm -r ${dir}\n`,
  );
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
