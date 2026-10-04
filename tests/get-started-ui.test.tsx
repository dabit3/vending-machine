import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import GetStartedPage from "../app/get-started/page";

vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer /> }));

test("explains applying the code under Plans and links the core docs", () => {
  const html = renderToStaticMarkup(<GetStartedPage />);
  expect(html).toContain('href="https://app.devin.ai/settings/plans"');
  expect(html).toContain("Enter your code at checkout");
  for (const href of [
    "https://docs.devin.ai/get-started/devin-intro",
    "https://docs.devin.ai/cli",
    "https://docs.devin.ai/desktop/getting-started",
  ]) {
    expect(html).toContain(`href="${href}"`);
  }
  expect(html).toContain("curl -fsSL https://cli.devin.ai/install.sh | bash");
  expect(html).toContain('href="/my-codes"');
});
