import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";
import SystemAdminGate from "../components/SystemAdminGate";
import AdminNav from "../components/AdminNav";
import NewEventForm from "../components/NewEventForm";

const state = vi.hoisted(() => ({
  authenticated: true,
  loading: false,
  global: false,
  configured: true,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: state.authenticated,
    isLoading: state.loading,
  }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    if (getFunctionName(ref) === "admins:accessLevel")
      return { isGlobalAdmin: state.global, hasEventAccess: true };
    if (getFunctionName(ref) === "stripeBatches:configuration")
      return { configured: state.configured, live: false };
    return undefined;
  },
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({
    results: [],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));

beforeEach(() =>
  Object.assign(state, {
    authenticated: true,
    loading: false,
    global: false,
    configured: true,
  }),
);

test("event admins do not see Stripe navigation or privileged page contents", () => {
  expect(renderToStaticMarkup(<AdminNav />)).not.toContain("Code studio");
  const html = renderToStaticMarkup(
    <SystemAdminGate>
      <div>Privileged generator</div>
    </SystemAdminGate>,
  );
  expect(html).toContain("System admins only");
  expect(html).not.toContain("Privileged generator");
});

test("loading and anonymous sessions cannot render privileged contents", () => {
  state.authenticated = false;
  let html = renderToStaticMarkup(
    <SystemAdminGate>
      <div>Privileged generator</div>
    </SystemAdminGate>,
  );
  expect(html).not.toContain("Privileged generator");
  state.loading = true;
  html = renderToStaticMarkup(
    <SystemAdminGate>
      <div>Privileged generator</div>
    </SystemAdminGate>,
  );
  expect(html).not.toContain("Privileged generator");
});

test("system admins see code studio and the privileged contents", () => {
  state.global = true;
  expect(renderToStaticMarkup(<AdminNav />)).toContain("Code studio");
  expect(
    renderToStaticMarkup(
      <SystemAdminGate>
        <div>Privileged generator</div>
      </SystemAdminGate>,
    ),
  ).toContain("Privileged generator");
});

test("new event form exposes all three code sources and keeps page settings optional", () => {
  const html = renderToStaticMarkup(<NewEventForm />);
  for (const label of [
    "Event details",
    "Generate new",
    "Use saved",
    "Add later",
    "Claim page settings",
    "Review and create",
    "Value per code (USD)",
  ])
    expect(html).toContain(label);
  expect(html).toContain('max="500"');
  expect(html).not.toContain("STRIPE_API_KEY");
});

test("missing Stripe setup disables generation without removing the other event flows", () => {
  state.configured = false;
  const html = renderToStaticMarkup(<NewEventForm />);
  expect(html).toContain("Stripe setup required");
  expect(html).toContain("Use saved");
  expect(html).toContain("Add later");
  expect(html).toContain("disabled");
});
