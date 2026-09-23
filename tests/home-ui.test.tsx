import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Home from "../app/page";

interface MineItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  eventDate?: string;
  claimed: boolean;
}

const state = vi.hoisted(() => ({
  mine: [] as MineItem[] | null | undefined,
  authenticated: true,
  authLoading: false,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: state.authenticated,
    isLoading: state.authLoading,
  }),
  useQuery: (_ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    return state.mine;
  },
}));
vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  Object.assign(state, {
    mine: [
      { _id: "today", name: "Today's event", slug: "today", eventDate: "2026-09-07", claimed: true },
      { _id: "upcoming", name: "Upcoming event", slug: "upcoming", eventDate: "2026-09-10", claimed: false },
      { _id: "undated", name: "Open event", slug: "open", description: "Walk-up", claimed: false },
      { _id: "old", name: "Old event", slug: "old", eventDate: "2026-07-01", claimed: false },
    ],
    authenticated: true,
    authLoading: false,
  });
});

afterEach(() => vi.useRealTimers());

test("signed-out visitors see the intro and a QR card, never an event list", () => {
  state.authenticated = false;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toMatch(/<h1\b[^>]*>Try Devin<\/h1>/);
  expect(html).toContain("Sign in");
  expect(html).toContain("Scan to claim");
  expect(html).toContain("QR code linking to https://trydevin.ai");
  expect(html).not.toContain("listed publicly");
  expect(html).not.toContain("Your events");
  expect(html).not.toContain('href="/today"');
  expect(html).not.toContain("Active events");
  expect(html).not.toContain("Recent past events");
});

test("signed-in visitors see every event they are eligible for, in server order", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Welcome back");
  expect(html).toMatch(/<h2\b[^>]*>Your events<\/h2>/);
  expect(html).toContain('href="/my-codes"');
  expect(html).not.toContain("Scan to claim");
  for (const slug of ["today", "upcoming", "open", "old"]) {
    expect(html).toContain(`href="/${slug}"`);
  }
  expect(html.indexOf('href="/today"')).toBeLessThan(html.indexOf('href="/upcoming"'));
  expect(html.indexOf('href="/upcoming"')).toBeLessThan(html.indexOf('href="/open"'));
  expect(html).toContain("Claimed");
  expect(html).toContain("Walk-up");
  // Past events stay listed but are dimmed.
  expect(html.match(/opacity-70/g)).toHaveLength(1);
});

test("loading, unverified, and empty states while signed in", () => {
  state.mine = undefined;
  expect(renderToStaticMarkup(<Home />)).toContain('aria-label="Loading your events"');
  state.mine = null;
  expect(renderToStaticMarkup(<Home />)).toContain("verified email address");
  state.mine = [];
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("No events yet");
  expect(html).not.toContain("Scan to claim");
});

test("while auth is resolving the right panel holds a placeholder instead of the QR card", () => {
  state.authenticated = false;
  state.authLoading = true;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain('aria-label="Loading your events"');
  expect(html).not.toContain("Scan to claim");
});
