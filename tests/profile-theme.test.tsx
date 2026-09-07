import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import HeaderAuth from "../components/HeaderAuth";
import SiteHeader from "../components/SiteHeader";
import AdminLayout from "../app/admin/layout";

type MenuAction = {
  label: string;
  onClick?: () => void;
  labelIcon?: ReactNode;
};
const state = vi.hoisted(() => ({
  authenticated: true,
  hydrated: true,
  resolvedTheme: "dark" as string | undefined,
  forcedTheme: undefined as string | undefined,
  actions: [] as MenuAction[],
  setTheme: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: (
      _subscribe: unknown,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown,
    ) =>
      state.hydrated ? getSnapshot() : (getServerSnapshot ?? getSnapshot)(),
  };
});

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: state.resolvedTheme,
    forcedTheme: state.forcedTheme,
    setTheme: state.setTheme,
  }),
}));

vi.mock("@clerk/nextjs", () => {
  const Action = (props: MenuAction) => {
    state.actions.push(props);
    return <button type="button">{props.label}</button>;
  };
  const MenuItems = ({ children }: { children?: ReactNode }) => (
    <div data-profile-menu>{children}</div>
  );
  const UserButton = Object.assign(
    ({ children }: { children?: ReactNode }) =>
      state.authenticated ? <div data-profile-button>{children}</div> : null,
    { Action, MenuItems },
  );
  return {
    UserButton,
    SignInButton: ({ children }: { children?: ReactNode }) => children,
    useUser: () => ({ user: null }),
  };
});

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: state.authenticated,
  }),
  useQuery: () => ({ isGlobalAdmin: true, hasEventAccess: true }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

beforeEach(() => {
  Object.assign(state, {
    authenticated: true,
    hydrated: true,
    resolvedTheme: "dark",
    forcedTheme: undefined,
    actions: [],
  });
  state.setTheme.mockReset().mockImplementation((value: string) => {
    state.resolvedTheme = value;
  });
});

test.each([
  ["dark", "light"],
  ["light", "dark"],
])(
  "the profile menu switches from %s to %s using the existing theme provider",
  (current, next) => {
    state.resolvedTheme = current;
    renderToStaticMarkup(<HeaderAuth />);
    expect(state.actions.map((action) => action.label)).toEqual([
      "manageAccount",
      `Switch to ${next} mode`,
      "signOut",
    ]);
    expect(state.setTheme).not.toHaveBeenCalled();
    const action = state.actions.find(
      (action) => action.label === `Switch to ${next} mode`,
    );
    expect(action?.labelIcon).toBeTruthy();
    action?.onClick?.();
    expect(state.setTheme).toHaveBeenCalledExactlyOnceWith(next);
    state.actions = [];
    renderToStaticMarkup(<HeaderAuth />);
    expect(state.actions.map((action) => action.label)).toContain(
      `Switch to ${current} mode`,
    );
  },
);

test("the admin header uses the same profile theme action", () => {
  renderToStaticMarkup(
    <AdminLayout>
      <div>Admin content</div>
    </AdminLayout>,
  );
  expect(state.actions.map((action) => action.label)).toContain(
    "Switch to light mode",
  );
});

test.each([true, false])(
  "the main header has no standalone theme button when authenticated is %s",
  (authenticated) => {
    state.authenticated = authenticated;
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html.includes('aria-label="Toggle color theme"')).toBe(false);
    expect(html).not.toContain("theme-toggle-moon-mask");
    if (!authenticated) {
      expect(html).toContain("Sign in");
      expect(state.actions).toHaveLength(0);
    }
    expect(state.setTheme).not.toHaveBeenCalled();
  },
);

test("the theme action waits for hydration without changing the saved preference", () => {
  state.hydrated = false;
  renderToStaticMarkup(<HeaderAuth />);
  expect(state.actions.map((action) => action.label)).toEqual([
    "manageAccount",
    "signOut",
  ]);
  expect(state.setTheme).not.toHaveBeenCalled();
});

test("an unresolved or forced theme does not expose a misleading toggle", () => {
  state.resolvedTheme = undefined;
  renderToStaticMarkup(<HeaderAuth />);
  expect(state.actions.map((action) => action.label)).toEqual([
    "manageAccount",
    "signOut",
  ]);
  state.actions = [];
  state.resolvedTheme = "dark";
  state.forcedTheme = "dark";
  renderToStaticMarkup(<HeaderAuth />);
  expect(state.actions.map((action) => action.label)).toEqual([
    "manageAccount",
    "signOut",
  ]);
});
