/**
 * The one failure the store raises before it has tried anything: there is no
 * database to ask. A class rather than a sentence, so the guard can tell it
 * apart with `instanceof` instead of matching words — the regex it used to
 * match never agreed with the sentence the store actually threw, and the
 * unconfigured case went out as a 502 where 503 was documented.
 *
 * No imports on purpose: `lib/api/guard.ts` and `lib/storage/collection.ts`
 * both need this, and `supabase.ts` is `server-only`, which a plain vitest
 * run cannot load.
 */
export class StoreNotConfigured extends Error {
  constructor() {
    super("No database is connected here.");
    this.name = "StoreNotConfigured";
  }
}
