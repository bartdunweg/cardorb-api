import next from "eslint-config-next";

// eslint-config-next exports the flat config as an array, not as a factory, so
// `...next()` threw "next is not a function" and `npm run check` had never got
// past typecheck and tests. Named rather than exported anonymously, which is
// its own rule in this config.

/**
 * The one import this project keeps on a short leash.
 *
 * `unstable_cache` is what holds the collection and the catalogue together
 * while cacheComponents is off, and Next's own documentation says in the same
 * breath that it is "replaced by `use cache` in Next.js 16". So it is the right
 * answer today and a migration tomorrow, and the size of that migration is
 * decided entirely by how many files reached for it in the meantime.
 *
 * Two files may. Everything else that wants a cache should ask one of them for
 * the data rather than caching its own copy, which is also the honest design:
 * a cache in a component is a cache nobody can invalidate.
 *
 * revalidateTag and revalidatePath are deliberately *not* restricted — those
 * are how a write says the cache is wrong, and they belong at the write.
 */
const CACHE_OWNERS = ["lib/core/catalogue.ts", "lib/core/collection.ts"];

const cacheLeash = {
  files: ["**/*.ts", "**/*.tsx"],
  ignores: CACHE_OWNERS,
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "next/cache",
            importNames: ["unstable_cache"],
            message:
              "unstable_cache lives in lib/core/catalogue.ts and lib/core/collection.ts only, so the move to `use cache` stays a two-file change. Ask those modules for the data instead.",
          },
        ],
      },
    ],
  },
};

const config = [{ ignores: [".next/**", "node_modules/**", "next-env.d.ts"] }, ...next, cacheLeash];

export default config;
