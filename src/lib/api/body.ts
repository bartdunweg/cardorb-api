/**
 * Reading a JSON body without letting a caller decide how much memory to use.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Ten route handlers read a body. Two of them capped its size; eight did not,
 * and those eight are the ones that take input from nobody in particular —
 * sign-in, signup, password, the two email flows, and a CSV import. Nothing
 * else bounds them: Next puts no limit on a route handler's body, and
 * `next.config.ts` sets none.
 *
 * The two that did cap were written the same way twice, and the pattern is
 * right. It is here now rather than in a third copy.
 *
 * ── Both checks, because one is not enough ─────────────────────────────────
 *
 * `content-length` is checked first, so a large body is refused before it is
 * read into memory at all — that is the whole point, and a caller that declares
 * honestly gets a cheap answer.
 *
 * Then the received text is checked too, because `content-length` can be absent
 * on a chunked request and can simply lie on any request. Checking only the
 * header is checking a claim; checking only the text means the memory was
 * already spent.
 */

export type BodyResult<T = unknown> =
  { kind: "ok"; body: T } | { kind: "too-large" } | { kind: "invalid" };

/**
 * A cap per shape of request rather than one number for the app.
 *
 * Named for what is being sent, so the number is arguable at the call site:
 * a password is not a CSV and should not share a limit with one.
 */
export const BODY_LIMIT = {
  /** An email, a password, a name. Anything near this is a paste accident. */
  credentials: 4_096,
  /** A card: eight short fields. */
  card: 8_192,
  /** A patch: a few inventory fields. */
  patch: 4_096,
  /** A folder: one name. */
  folder: 1_024,
  /** A profile: a display name, a username, a URL. */
  profile: 8_192,
  /**
   * An avatar as a data URL. The route already caps the *decoded* image at 2 MB,
   * but only after reading and parsing it — this refuses before that, with room
   * for base64's ~33% overhead and the JSON around it.
   */
  avatar: 4_000_000,
  /**
   * A collection export. Deliberately the outlier — 1,600 rows of card names
   * is a real file somebody means to send, and refusing it would break the
   * feature this limit is supposed to protect.
   */
  csv: 2_000_000,
} as const;

/**
 * The body, or why not.
 *
 * Returns rather than throws, and returns a *reason* rather than null, because
 * the two failures need different answers: 413 for too large and 400 for
 * malformed. A caller that cannot tell them apart tells the sender to fix the
 * wrong thing.
 */
export async function readJsonBody<T = unknown>(
  req: Request,
  limit: number,
): Promise<BodyResult<T>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { kind: "too-large" };

  try {
    const raw = await req.text();
    // Bytes, not characters. `raw.length` counts UTF-16 code units, and a limit
    // written in bytes then lets through anything that is not ASCII: "é" is one
    // unit and two bytes, so a 1 kB cap accepted 2 kB of accented text and about
    // 1.5 kB of CJK. The declared content-length above is already in bytes, so
    // the two halves of this guard were measuring different things.
    if (new TextEncoder().encode(raw).length > limit) return { kind: "too-large" };
    return { kind: "ok", body: JSON.parse(raw) as T };
  } catch {
    return { kind: "invalid" };
  }
}
