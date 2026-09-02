import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The reference page renders every operation in the contract.
 *
 * The chrome is stubbed: Navbar and MarketingFooter are the web tool's, are
 * tested where they live, and pull in the icon set, which is not what this
 * test is about. What is left is the page reading `public/openapi.yaml` and
 * drawing one heading per operation — the thing that has to be true for the
 * page to be a reference at all.
 */
vi.mock("@/components/shared/Navbar", () => ({ default: () => null }));
vi.mock("@/components/shared/MarketingFooter", () => ({ default: () => null }));

describe("/docs/api", () => {
  it("draws one heading per operation, under the contract's tags", async () => {
    const { default: Page } = await import("./page");
    const { readSpec, sections } = await import("./_components/reference");
    const html = renderToStaticMarkup(<Page />);

    const groups = sections(readSpec());
    for (const group of groups) {
      expect(html).toContain(`>${group.tag}<`);
      for (const op of group.operations) {
        expect(html).toContain(`>${op.method}<`);
        expect(html).toContain(`>${op.path.replace(/</g, "&lt;")}<`);
      }
    }
    expect(html).toContain('id="main-content"');
    expect(html).toContain('href="/openapi.yaml"');
  });
});
