import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import SignUpPage from "../app/sign-up/[[...sign-up]]/page";

vi.mock("@clerk/nextjs", () => ({
  SignUp: (props: Record<string, unknown>) => (
    <div data-testid="clerk-sign-up" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer /> }));

// Clerk needs a real sign-up route: without one its OAuth callbacks and
// continue steps either leave for the hosted Account Portal or land on
// /sign-up, which the [slug] route reports as "Event not found".
test("/sign-up renders Clerk's SignUp component", async () => {
  const html = renderToStaticMarkup(
    await SignUpPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('data-testid="clerk-sign-up"');
  expect(html).toContain("Create your account");
  expect(html).toContain("data-props=\"{}\"");
});

test("/sign-up forwards a same-site redirect_url as the forced redirect", async () => {
  const html = renderToStaticMarkup(
    await SignUpPage({
      searchParams: Promise.resolve({
        redirect_url: "https://trydevin.ai/admin/events/abc/walkup",
      }),
    }),
  );
  expect(html).toContain(
    JSON.stringify({
      forceRedirectUrl: "/admin/events/abc/walkup",
      signInForceRedirectUrl: "/admin/events/abc/walkup",
    }).replace(/"/g, "&quot;"),
  );
});

test("ClerkProvider points sign-in and sign-up at routes on this origin", () => {
  const layout = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  expect(layout).toMatch(/signUpUrl=\{[^}]*"\/sign-up"\}/);
  expect(layout).toMatch(/signInUrl=\{[^}]*"\/sign-in"\}/);
});
