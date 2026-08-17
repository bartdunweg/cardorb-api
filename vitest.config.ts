import { defineConfig } from "vitest/config";

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
