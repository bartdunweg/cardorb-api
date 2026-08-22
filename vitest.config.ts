import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * There was no config here at all, and the defaults were right until the day
 * they were not.
 *
 * Claude's worktrees live *inside* the checkout, at .claude/worktrees/<id>/,
 * and each is a complete copy of this repo — including its own test files from
 * whenever that worktree was made. Vitest's default include is `**\/*.test.ts`,
 * so running the suite in the main checkout collected and ran a two-day-old
 * copy of the project's tests alongside the real ones and reported their
 * failures as this project's. Same for node_modules and build output.
 */
export default defineConfig({
  resolve: {
    /* `@/*` → src/, the same single mapping tsconfig.json gives the compiler
       and Next gives the bundler. Vitest reads neither, so a module importing
       `@/utils/cx` — which every vendored Untitled UI component does — fails to
       resolve here while type-checking and building fine.

       This was a two-entry customResolver while the src/ migration ran, for the
       same reason tsconfig's alias was: a module could be under either root. */
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      // The two that matter here, and the reason this file exists.
      "**/.claude/**",
      "**/.context/**",
      // Playwright's specs, which call a test() that is not this one. Vitest
      // collects them by extension and then fails with "Playwright Test did not
      // expect test() to be called here" — two runners, one naming convention.
      "visual/**",
    ],
  },
});
