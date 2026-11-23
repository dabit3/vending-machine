import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import PwaProvider, { InstallAppButton } from "../components/PwaProvider";

const state = vi.hoisted(() => ({ hydrated: true, nativePrompt: false }));

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown, serverSnapshot: () => unknown) =>
      state.hydrated ? snapshot() : serverSnapshot(),
    useState: (initial: unknown) => [
      initial === null && state.nativePrompt ? { prompt: vi.fn() } : initial,
      vi.fn(),
    ],
  };
});

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  state.hydrated = true;
  state.nativePrompt = false;
});

function render({ chromium = false, standalone = false } = {}) {
  vi.stubGlobal("window", {
    ...(chromium ? { onbeforeinstallprompt: null } : {}),
    matchMedia: () => ({ matches: standalone }),
  });
  vi.stubGlobal("navigator", { serviceWorker: {}, onLine: true, userAgent: "Safari", platform: "iPhone" });
  return renderToStaticMarkup(<PwaProvider><InstallAppButton /></PwaProvider>);
}

test("a reloaded Chromium tab does not re-offer installation without browser eligibility", () => {
  expect(render({ chromium: true })).not.toContain("Install app");
});

test("Chromium offers installation when the browser supplies a native prompt", () => {
  state.nativePrompt = true;
  expect(render({ chromium: true })).toContain("Install app");
});

test("Safari still offers the manual home-screen instructions entry point", () => {
  expect(render()).toContain("Install app");
});

test("standalone apps never offer to install themselves", () => {
  expect(render({ standalone: true })).not.toContain("Install app");
});

test("install controls wait for hydration", () => {
  state.hydrated = false;
  expect(render()).not.toContain("Install app");
});
