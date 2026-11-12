import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Home from "../app/page";

interface MineItem {
  _id: string;
  _creationTime?: number;
  name: string;
  slug: string;
  description?: string;
  eventDate?: string;
  claimed: boolean;
  favorite?: boolean;
}

interface StarredItem extends Omit<MineItem, "claimed" | "favorite"> {
  manages: boolean;
}

const state = vi.hoisted(() => ({
  mine: [] as MineItem[] | null | undefined,
  starred: [] as StarredItem[] | undefined,
  authenticated: true,
  authLoading: false,
  // Convex lags Clerk: it reports signed-out while validating a fresh token.
  convexAuthenticated: true,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: state.authenticated && state.convexAuthenticated,
    isLoading: false,
  }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    return getFunctionName(ref) === "favorites:mine" ? state.starred : state.mine;
  },
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate: () => vi.fn() }),
}));
vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    isLoaded: !state.authLoading,
    isSignedIn: state.authLoading ? undefined : state.authenticated,
  }),
}));
vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  Object.assign(state, {
    starred: [],
    mine: [
      { _id: "today", name: "Today's event", slug: "today", eventDate: "2026-09-07", claimed: true },
      { _id: "upcoming", name: "Upcoming event", slug: "upcoming", eventDate: "2026-09-10", claimed: false },
      { _id: "undated", _creationTime: Date.parse("2026-08-01T00:00:00Z"), name: "Open event", slug: "open", description: "Walk-up", claimed: false },
      { _id: "old", name: "Old event", slug: "old", eventDate: "2026-07-01", claimed: false },
    ],
    authenticated: true,
    authLoading: false,
    convexAuthenticated: true,
  });
});

afterEach(() => vi.useRealTimers());

test("signed-out visitors see the intro and a QR card, never an event list", () => {
  state.authenticated = false;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toMatch(/<h1\b[^>]*>Try Devin<\/h1>/);
  expect(html).toContain("Sign in to claim your credits.");
  expect(html).not.toContain("Free credits");
  expect(html).toContain("Scan to claim");
  expect(html).toContain("QR code linking to https://trydevin.ai");
  // The QR card is desktop-only; phones get just the centered intro.
  expect(html).toMatch(/<section class="[^"]*\bhidden lg:flex\b[^"]*" aria-label="How to claim"/);
  expect(html).not.toContain("listed publicly");
  expect(html).not.toContain("Your events");
  expect(html).not.toContain('href="/today"');
  expect(html).not.toContain("Active events");
  expect(html).not.toContain("Recent past events");
});

test("signed-in visitors see their 3 newest events, newest first, with a View all button", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Welcome back");
  expect(html).toMatch(/<h2\b[^>]*>Your events<\/h2>/);
  expect(html).toContain('href="/my-codes"');
  expect(html).toContain('href="/my-codes/get-started"');
  expect(html).not.toContain("Scan to claim");
  expect(html).toMatch(/<section class="(?:(?!\bhidden lg:flex\b)[^"])*" aria-label="Your events"/);
  expect(html.indexOf('href="/upcoming"')).toBeLessThan(html.indexOf('href="/today"'));
  expect(html.indexOf('href="/today"')).toBeLessThan(html.indexOf('href="/open"'));
  expect(html).not.toContain('href="/old"');
  expect(html).toContain("View all 4 events");
  expect(html).toContain("Claimed");
  expect(html).toContain("Walk-up");
});

test("three or fewer events show without a View all button; past ones are dimmed", () => {
  state.mine = state.mine!.filter((e) => e._id !== "undated");
  const html = renderToStaticMarkup(<Home />);
  for (const slug of ["upcoming", "today", "old"]) {
    expect(html).toContain(`href="/${slug}"`);
  }
  expect(html.indexOf('href="/today"')).toBeLessThan(html.indexOf('href="/old"'));
  expect(html).not.toContain("View all");
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

test("while auth is resolving both panels hold placeholders instead of signed-out copy", () => {
  state.authenticated = false;
  state.authLoading = true;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain('aria-label="Checking sign-in"');
  expect(html).toContain('aria-label="Loading your events"');
  expect(html).not.toContain("Scan to claim");
  expect(html).not.toContain("Sign in to claim your credits.");
  expect(html).not.toContain("Welcome back");
});

test("right after signing in, the signed-in layout shows while Convex is still validating the token", () => {
  state.convexAuthenticated = false;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Welcome back");
  expect(html).toContain('aria-label="Loading your events"');
  expect(html).not.toContain("Sign in to claim your credits.");
  expect(html).not.toContain("Scan to claim");
});

test("starred events are pinned above the rest, managed ones linking to the manage page", () => {
  state.mine = state.mine!.map((e) => (e._id === "old" ? { ...e, favorite: true } : e));
  state.starred = [
    { _id: "old", name: "Old event", slug: "old", eventDate: "2026-07-01", manages: false },
    { _id: "run", name: "Event I run", slug: "run", eventDate: "2026-09-08", manages: true },
  ];
  const html = renderToStaticMarkup(<Home />);
  expect(html).toMatch(/<h2\b[^>]*>Starred<\/h2>/);
  const order = ["Starred</h2>", "Event I run", "Old event", "Your events</h2>", "Upcoming event", "Today"];
  const at = order.map((text) => html.indexOf(text));
  expect(at).toEqual([...at].sort((a, b) => a - b));
  expect(at[0]).toBeGreaterThan(-1);
  expect(html).toContain('href="/admin/events/run"');
  expect(html).toContain('href="/old"');
  // A starred event is not repeated in the list below.
  expect(html.split("Old event</span>").length - 1).toBe(1);
  expect(html).toContain('aria-pressed="true" aria-label="Unstar Old event"');
  expect(html).toContain('aria-pressed="false" aria-label="Star Upcoming event"');
});

test("an admin with only starred events sees them instead of the empty state", () => {
  state.mine = [];
  state.starred = [{ _id: "run", name: "Event I run", slug: "run", manages: true }];
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("Event I run");
  expect(html).not.toContain("No events yet");
  expect(html).not.toContain("Your events</h2>");
});
