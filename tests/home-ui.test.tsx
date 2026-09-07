import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Home from "../app/page";

const state = vi.hoisted(() => ({
  events: [] as { _id: string; name: string; slug: string; eventDate?: string }[] | undefined,
  claimed: [] as { event: { _id: string } }[],
  theme: "light",
  authenticated: true,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    return getFunctionName(ref) === "events:list" ? state.events : state.claimed;
  },
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: state.theme }),
}));
vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/UnicornSceneEmbed", () => ({ default: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  Object.assign(state, {
    events: [
      { _id: "upcoming", name: "Upcoming event", slug: "upcoming", eventDate: "2026-09-10" },
      { _id: "today", name: "Today's event", slug: "today", eventDate: "2026-09-07" },
      { _id: "undated", name: "Open event", slug: "open" },
      { _id: "past", name: "Recent event", slug: "recent", eventDate: "2026-09-01" },
      { _id: "old", name: "Old event", slug: "old", eventDate: "2026-07-01" },
    ],
    claimed: [{ event: { _id: "today" } }],
    theme: "light",
    authenticated: true,
  });
});

afterEach(() => vi.useRealTimers());

test.each(["light", "dark"])("the %s homepage preserves event links, grouping, and claimed status", (theme) => {
  state.theme = theme;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain("h-[520px]");
  expect(html).toContain("sm:h-[486px]");
  expect(html).toContain("max-w-5xl");
  expect(html).toContain("text-5xl");
  expect(html).toContain("sm:text-7xl");
  expect(html).not.toContain("frame-rails");
  expect(html).not.toContain("View event");
  expect(html).toContain('href="/today"');
  expect(html).toContain('href="/upcoming"');
  expect(html).toContain('href="/open"');
  expect(html).toContain('href="/recent"');
  expect(html).not.toContain('href="/old"');
  expect(html).toContain("Claimed");
  expect(html.indexOf('href="/today"')).toBeLessThan(html.indexOf('href="/upcoming"'));
  expect(html.indexOf('href="/upcoming"')).toBeLessThan(html.indexOf('href="/open"'));
  expect(html.indexOf("Past events")).toBeLessThan(html.indexOf('href="/recent"'));
  expect(html).not.toContain("text-black");
  expect(html).not.toContain("text-white");
});

test("anonymous visitors can browse without querying claimed codes", () => {
  state.authenticated = false;
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain('href="/today"');
  expect(html).not.toContain("Claimed");
});

test("the loading and empty states remain available", () => {
  state.events = undefined;
  expect(renderToStaticMarkup(<Home />)).toContain('aria-label="Loading active events"');
  state.events = [];
  expect(renderToStaticMarkup(<Home />)).toContain("Nothing to dispense yet");
});
