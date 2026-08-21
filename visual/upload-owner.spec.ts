import { expect, test } from "@playwright/test";

/**
 * The one thing in this directory that is not a screenshot.
 *
 * It is here because the avatar upload is the only control in the app whose
 * whole job happens after a click that opens an operating-system dialog, and
 * a picture of the button proves none of it. It earned a test rather than
 * inheriting one: `components/base/file-upload-trigger` sat vendored and
 * unused with two faults that would each have thrown on first render — a
 * `React.Children` call in a file that never imports `React`, and an import
 * of `@react-aria/utils`, which is not a dependency of this project. Both are
 * invisible to typecheck (@ts-nocheck, ADR-0062) and to lint, and no consumer
 * meant nothing ever ran the file to find out.
 *
 * Twice on purpose. The code this replaced cleared the input's value by hand
 * before every await, with a comment saying why: picking the same file two
 * times in a row has to fire the second time too. FileTrigger makes the same
 * guarantee its own way, and this is what checks that it does.
 */
test("the avatar upload trigger opens a chooser, twice", async ({ page: p }) => {
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto("/settings", { waitUntil: "networkidle" });
  await expect(p).not.toHaveURL(/\/login/);

  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));

  const button = p.getByRole("button", { name: /^(Upload|Change)$/ }).first();
  await expect(button).toBeVisible({ timeout: 10_000 });

  for (const _round of [1, 2]) {
    const chooser = p.waitForEvent("filechooser", { timeout: 5_000 });
    await button.click();
    const fileChooser = await chooser;
    expect(fileChooser.isMultiple()).toBe(false);
  }

  expect(errors).toEqual([]);
});
