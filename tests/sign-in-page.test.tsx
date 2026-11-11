import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import SignInPage from "../app/sign-in/[[...sign-in]]/page";
import { safeReturnPath } from "../lib/return-url";

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: Record<string, unknown>) => (
    <div data-testid="clerk-sign-in" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer /> }));

// Admin links (the walk-up page in particular) are opened signed out on a
// phone; proxy.ts sends the visitor to /sign-in?redirect_url=<that page>,
// and the page must come back there rather than the default destination.
test("/sign-in forces the redirect back to the protected admin page", async () => {
  const html = renderToStaticMarkup(
    await SignInPage({
      searchParams: Promise.resolve({
        redirect_url: "https://trydevin.ai/admin/events/abc/walkup",
      }),
    }),
  );
  expect(html).toContain('data-testid="clerk-sign-in"');
  expect(html).toContain(
    JSON.stringify({
      forceRedirectUrl: "/admin/events/abc/walkup",
      signUpForceRedirectUrl: "/admin/events/abc/walkup",
    }).replace(/"/g, "&quot;"),
  );
});

test("/sign-in without redirect_url leaves Clerk's default redirect alone", async () => {
  const html = renderToStaticMarkup(
    await SignInPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("data-props=\"{}\"");
});

test("safeReturnPath keeps only same-site paths", () => {
  expect(safeReturnPath("/admin/events/abc/walkup")).toBe("/admin/events/abc/walkup");
  expect(safeReturnPath("/my-event?preview=1")).toBe("/my-event?preview=1");
  expect(safeReturnPath("http://localhost:3000/admin?x=1")).toBe("/admin?x=1");
  expect(safeReturnPath(["/admin/codes", "/other"])).toBe("/admin/codes");
  expect(safeReturnPath(undefined)).toBeUndefined();
  expect(safeReturnPath("")).toBeUndefined();
  expect(safeReturnPath("/")).toBeUndefined();
  expect(safeReturnPath("/sign-in")).toBeUndefined();
  expect(safeReturnPath("/sign-up/continue")).toBeUndefined();
  expect(safeReturnPath("//evil.example/admin")).toBeUndefined();
  expect(safeReturnPath("javascript:alert(1)")).toBeUndefined();
  expect(safeReturnPath("mailto:a@b.c")).toBeUndefined();
  expect(safeReturnPath("/admin\\@evil.example")).toBeUndefined();
  expect(safeReturnPath("not a url")).toBeUndefined();
});
