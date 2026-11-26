import { beforeEach, expect, test, vi } from "vitest";
import robots from "../app/robots";
import nextConfig from "../next.config";
import { isValidEventSlug } from "../lib/slug";

const mocks = vi.hoisted(() => ({
  fetchQuery: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("convex/nextjs", () => ({
  fetchQuery: mocks.fetchQuery,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => null,
  SignUp: () => null,
}));

vi.mock("../components/ClaimPage", () => ({
  default: ({ slug }: { slug: string }) => <div data-claim={slug} />,
}));

vi.mock("../components/EventQrPage", () => ({
  default: ({ slug }: { slug: string }) => <div data-qr={slug} />,
}));

vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer /> }));
vi.mock("../components/ProfileMenu", () => ({ default: () => null }));
vi.mock("../components/AdminGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../components/AdminNav", () => ({ default: () => null }));
vi.mock("../components/BrandMark", () => ({ BrandWordmark: () => null }));
vi.mock("../components/DevinCredit", () => ({ default: () => null }));
vi.mock("../components/HeaderBar", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  mocks.fetchQuery.mockReset();
  mocks.notFound.mockClear();
});

test("robots.txt allows only public landing, legal, and get-started routes and disallows everything else", () => {
  const result = robots();
  expect(result).toEqual({
    rules: {
      userAgent: "*",
      allow: ["/$", "/privacy$", "/terms$", "/my-codes/get-started$"],
      disallow: "/",
    },
  });
});

test("isValidEventSlug accepts canonical slugs and rejects crawler probe paths", () => {
  expect(isValidEventSlug("sf-hackathon")).toBe(true);
  expect(isValidEventSlug("devin2026")).toBe(true);
  expect(isValidEventSlug("a")).toBe(true);

  expect(isValidEventSlug("")).toBe(false);
  expect(isValidEventSlug("robots.txt")).toBe(false);
  expect(isValidEventSlug("sitemap.xml")).toBe(false);
  expect(isValidEventSlug("wp-login.php")).toBe(false);
  expect(isValidEventSlug("SF-Hackathon")).toBe(false);
  expect(isValidEventSlug("-leading")).toBe(false);
  expect(isValidEventSlug("trailing-")).toBe(false);
  expect(isValidEventSlug("double--dash")).toBe(false);
  expect(isValidEventSlug("under_score")).toBe(false);
});

test("lookupEventMeta rejects invalid slugs without querying Convex", async () => {
  const { lookupEventMeta } = await import("../lib/event-meta");
  const result = await lookupEventMeta("sitemap.xml");
  expect(result).toEqual({ status: "not_found" });
  expect(mocks.fetchQuery).not.toHaveBeenCalled();
});

test("lookupEventMeta distinguishes found, not_found, and error", async () => {
  const { lookupEventMeta } = await import("../lib/event-meta");

  mocks.fetchQuery.mockResolvedValueOnce({
    name: "SF Hackathon",
    description: "Claim **Devin** credits.",
    eventDate: "2026-11-26",
  });
  expect(await lookupEventMeta("sf-hackathon")).toEqual({
    status: "found",
    event: {
      name: "SF Hackathon",
      description: "Claim Devin credits.",
      eventDate: "2026-11-26",
      eventEndDate: undefined,
    },
  });

  mocks.fetchQuery.mockResolvedValueOnce(null);
  expect(await lookupEventMeta("missing-event")).toEqual({
    status: "not_found",
  });

  mocks.fetchQuery.mockRejectedValueOnce(new Error("network down"));
  expect(await lookupEventMeta("transient-error")).toEqual({
    status: "error",
  });
});

test("event claim page sets noindex metadata and calls notFound for unknown slugs", async () => {
  const { default: EventPage, generateMetadata } = await import(
    "../app/[slug]/page"
  );

  mocks.fetchQuery.mockResolvedValueOnce({
    name: "SF Hackathon",
    description: "Free credits.",
  });
  const foundMeta = await generateMetadata({
    params: Promise.resolve({ slug: "sf-hackathon" }),
    searchParams: Promise.resolve({}),
  });
  expect(foundMeta.robots).toEqual({ index: false, follow: false });
  expect(foundMeta.title).toBe("SF Hackathon · Try Devin");
  expect(foundMeta.openGraph).toMatchObject({ url: "/sf-hackathon" });

  mocks.fetchQuery.mockResolvedValueOnce(null);
  const missingMeta = await generateMetadata({
    params: Promise.resolve({ slug: "unknown-slug" }),
    searchParams: Promise.resolve({}),
  });
  expect(missingMeta.robots).toEqual({ index: false, follow: false });

  mocks.fetchQuery.mockResolvedValueOnce(null);
  await expect(
    EventPage({
      params: Promise.resolve({ slug: "unknown-slug" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.notFound).toHaveBeenCalledTimes(1);

  mocks.fetchQuery.mockRejectedValueOnce(new Error("convex unreachable"));
  const fallbackEl = await EventPage({
    params: Promise.resolve({ slug: "transient-error" }),
    searchParams: Promise.resolve({}),
  });
  expect(fallbackEl).toBeTruthy();
  expect(mocks.notFound).toHaveBeenCalledTimes(1);
});

test("event QR page sets noindex metadata and calls notFound for unknown slugs", async () => {
  const { default: EventQrRoute, generateMetadata } = await import(
    "../app/[slug]/qr/page"
  );

  mocks.fetchQuery.mockResolvedValueOnce({
    name: "SF Hackathon",
  });
  const foundMeta = await generateMetadata({
    params: Promise.resolve({ slug: "sf-hackathon" }),
  });
  expect(foundMeta.robots).toEqual({ index: false, follow: false });
  expect(foundMeta.title).toBe("SF Hackathon QR · Try Devin");

  mocks.fetchQuery.mockResolvedValueOnce(null);
  await expect(
    EventQrRoute({ params: Promise.resolve({ slug: "unknown-slug" }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.notFound).toHaveBeenCalledTimes(1);
});

test("event opengraph image returns 404 for unknown slugs", async () => {
  const { default: Image } = await import("../app/[slug]/opengraph-image");
  mocks.fetchQuery.mockResolvedValueOnce(null);
  const response = await Image({
    params: Promise.resolve({ slug: "unknown-slug" }),
  });
  expect(response.status).toBe(404);
});

test("admin and auth routes carry noindex metadata", async () => {
  const { metadata: adminMeta } = await import("../app/admin/layout");
  const { metadata: signInMeta } = await import(
    "../app/sign-in/[[...sign-in]]/page"
  );
  const { metadata: signUpMeta } = await import(
    "../app/sign-up/[[...sign-up]]/page"
  );

  expect(adminMeta.robots).toEqual({ index: false, follow: false });
  expect(signInMeta.robots).toEqual({ index: false, follow: false });
  expect(signUpMeta.robots).toEqual({ index: false, follow: false });
});

test("next.config.ts sets default-deny X-Robots-Tag and allows only public routes", async () => {
  const rules = await nextConfig.headers!();
  const robotsRules = rules.filter((r) =>
    r.headers.some((h) => h.key === "X-Robots-Tag"),
  );
  expect(robotsRules).toEqual([
    {
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
    {
      source: "/",
      headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
    },
    {
      source: "/privacy",
      headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
    },
    {
      source: "/terms",
      headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
    },
    {
      source: "/my-codes/get-started",
      headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
    },
  ]);
});
