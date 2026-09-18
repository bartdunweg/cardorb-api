import { createHash, createHmac, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { directUrl, poolerParts, scramVerifier } from "../../../scripts/direct-db-credentials.mjs";

type SaslSession = { response: string };
// pg's own client side of SCRAM, which ships untyped: what the API's pool signs in with.
const sasl = createRequire(import.meta.url)("pg/lib/crypto/sasl.js") as {
  startSession: (mechanisms: string[]) => SaslSession;
  continueSession: (session: SaslSession, password: string, serverData: string) => Promise<void>;
  finalizeSession: (session: SaslSession, serverData: string) => Promise<void> | void;
};

/**
 * The owner's credential script (docs/direct-db.md). The verifier it prints is checked by playing
 * the server's half of a SCRAM-SHA-256 exchange against pg's client: a wrong verifier would leave
 * the role unable to sign in, and the API quietly on the gateway.
 */
describe("scramVerifier", () => {
  it("lets pg's client sign in with the password, and not with another", async () => {
    const password = randomBytes(32).toString("base64url");
    const verifier = scramVerifier(password);
    const [, iterSalt, keys] = verifier.split("$");
    const [iterations, salt] = iterSalt!.split(":");
    const [storedKey, serverKey] = keys!.split(":").map((k) => Buffer.from(k!, "base64"));

    const attempt = async (tried: string) => {
      const session = sasl.startSession(["SCRAM-SHA-256"]);
      const clientFirstBare = session.response.slice(3);
      const clientNonce = clientFirstBare.split("r=")[1];
      const serverFirst = `r=${clientNonce}${randomBytes(12).toString("base64")},s=${salt},i=${iterations}`;
      await sasl.continueSession(session, tried, serverFirst);
      const [withoutProof, proof] = session.response.split(",p=");
      const authMessage = `${clientFirstBare},${serverFirst},${withoutProof}`;
      const signature = createHmac("sha256", storedKey!).update(authMessage).digest();
      const clientKey = Buffer.from(proof!, "base64").map((b, i) => b ^ signature[i]!);
      const ok = createHash("sha256").update(clientKey).digest().equals(storedKey!);
      if (ok) {
        const serverSig = createHmac("sha256", serverKey!).update(authMessage).digest("base64");
        await sasl.finalizeSession(session, `v=${serverSig}`);
      }
      return ok;
    };

    expect(await attempt(password)).toBe(true);
    expect(await attempt(`${password}x`)).toBe(false);
  });
});

describe("poolerParts and directUrl", () => {
  it("keeps the dashboard's host, port and project ref and swaps in the role", () => {
    const parts = poolerParts(
      "postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    );
    expect(parts).toEqual({
      host: "aws-0-eu-west-1.pooler.supabase.com",
      port: "6543",
      ref: "abcdefghijklmnop",
    });
    expect(directUrl(parts, "pw")).toBe(
      "postgresql://cardorb_direct.abcdefghijklmnop:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    );
  });

  it("refuses the direct (non-pooler) string", () => {
    expect(() =>
      poolerParts(
        "postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnop.supabase.co:5432/postgres",
      ),
    ).toThrow(/pooler/);
  });
});
