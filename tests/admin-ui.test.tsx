import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { beforeEach, expect, test, vi } from "vitest";
import SystemAdminGate from "../components/SystemAdminGate";
import AdminNav from "../components/AdminNav";
import NewEventForm from "../components/NewEventForm";
import AdminDashboard from "../app/admin/page";
import CodeStudioPage from "../components/CodeStudioPage";
import { SavedBatchPicker } from "../components/StripeBatchDetails";
import StripeCodeStudio from "../components/StripeCodeStudio";
import { StripeGenerationFields } from "../components/StripeGenerationFields";
import { emptyStripeForm } from "../lib/stripe-form";
import NewCodeBlockPage from "../app/admin/codes/new/page";

const state = vi.hoisted(() => ({
  authenticated: true,
  loading: false,
  global: false,
  configured: true,
  history: [] as FunctionReturnType<typeof api.stripeBatches.history>["page"],
  historyStatus: "Exhausted" as
    "Exhausted" | "CanLoadMore" | "LoadingFirstPage" | "LoadingMore",
  detail: undefined as
    FunctionReturnType<typeof api.stripeBatches.get> | undefined,
  events: [] as FunctionReturnType<typeof api.events.listManaged>,
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
    if (getFunctionName(ref) === "stripeBatches:get") return state.detail;
    if (getFunctionName(ref) === "events:listManaged") return state.events;
    return undefined;
  },
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({
    results: state.history,
    status: state.historyStatus,
    loadMore: vi.fn(),
  }),
}));

beforeEach(() =>
  Object.assign(state, {
    authenticated: true,
    loading: false,
    global: false,
    configured: true,
    history: [],
    historyStatus: "Exhausted",
    detail: undefined,
    events: [],
  }),
);

test("event admins do not see Stripe navigation or privileged page contents", () => {
  expect(renderToStaticMarkup(<AdminNav />)).not.toContain(
    'href="/admin/codes"',
  );
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
  expect(renderToStaticMarkup(<AdminNav />)).toContain('href="/admin/codes"');
  expect(renderToStaticMarkup(<AdminNav />)).toContain(">Codes</a>");
  expect(
    renderToStaticMarkup(
      <SystemAdminGate>
        <div>Privileged generator</div>
      </SystemAdminGate>,
    ),
  ).toContain("Privileged generator");
});

function savedBlock(): FunctionReturnType<
  typeof api.stripeBatches.history
>["page"][number] {
  return {
    _id: "a".repeat(32) as Id<"stripeBatches">,
    _creationTime: Date.UTC(2026, 0, 1),
    name: "Saved credits",
    prefix: "",
    amountCents: 5000,
    quantity: 2,
    redemptionsPerCode: 1,
    expiresAt: undefined,
    live: false,
    createdBy: "admin@example.com",
    status: "complete",
    generatedCount: 2,
    couponId: "coupon_saved",
    error: undefined,
    eventId: undefined,
    targetEventId: undefined,
    codeType: undefined,
    expired: false,
    canRetry: false,
    eventName: null,
  };
}

test("the library shows saved blocks as browsable rows with values, status, assignment, and pagination", () => {
  const batch = savedBlock();
  state.history = [
    batch,
    {
      ...batch,
      _id: "b".repeat(32) as Id<"stripeBatches">,
      name: "Assigned credits",
      eventId: "e".repeat(32) as Id<"events">,
      eventName: "Hackathon",
    },
  ];
  state.historyStatus = "CanLoadMore";
  const html = renderToStaticMarkup(<CodeStudioPage />);
  for (const label of [
    "Saved credits",
    "Assigned credits",
    "$50.00",
    "Ready",
    "Unassigned",
    "Assigned to Hackathon",
    "Load more code blocks",
  ])
    expect(html.includes(label)).toBe(true);
  expect(html).toContain(`href="/admin/codes?batch=${batch._id}"`);
  expect(html).not.toContain("Choose a batch");
});

test("saved block details show all codes and make event assignment optional", () => {
  const batch = savedBlock();
  state.detail = {
    ...batch,
    codes: [
      { id: "promo_one", code: "CODE-ONE" },
      { id: "promo_two", code: "CODE-TWO" },
    ],
  };
  const html = renderToStaticMarkup(<CodeStudioPage batchId={batch._id} />);
  for (const label of [
    "CODE-ONE",
    "CODE-TWO",
    "Copy all",
    "Download CSV",
    "Saved to your code library",
    "No event required",
    "Add to an existing event (optional)",
  ])
    expect(html.includes(label)).toBe(true);
  expect(html).toContain(`href="/admin/events/new?batch=${batch._id}"`);
  expect(html).not.toContain("<details open");
});

test.each([1, 2])("failed batches with %i saved codes distinguish generation from finalization", (generatedCount) => {
  const batch = savedBlock();
  state.detail = {
    ...batch, status: "failed", generatedCount, canRetry: true, error: "Saved batch needs attention.",
    codes: Array.from({ length: generatedCount }, (_, index) => ({ id: `promo_${index}`, code: `SAVED-${index}` })),
  };
  const html = renderToStaticMarkup(<CodeStudioPage batchId={batch._id} />);
  expect(html).toContain(generatedCount === batch.quantity ? "Finalization stopped" : "Generation stopped");
  expect(html).toContain("Resume generation");
  expect(html).toContain("Download CSV");
});

test("expired blocks remain viewable but do not offer event assignment", () => {
  const batch = savedBlock();
  state.detail = {
    ...batch,
    expired: true,
    codes: [{ id: "promo_one", code: "CODE-ONE" }],
  };
  const html = renderToStaticMarkup(<CodeStudioPage batchId={batch._id} />);
  expect(html.includes("Expired code block")).toBe(true);
  expect(html).toContain("Download CSV");
  expect(html).not.toContain(`/admin/events/new?batch=${batch._id}`);
});

test("the standalone creation route requires system-admin access", async () => {
  const page = await NewCodeBlockPage({ searchParams: Promise.resolve({}) });
  expect(renderToStaticMarkup(page)).toContain("System admins only");
  expect(renderToStaticMarkup(page)).not.toContain("Review and save codes");
  state.global = true;
  const html = renderToStaticMarkup(page);
  expect(html).toContain("Review and save codes");
  expect(html).not.toContain('id="event-name"');
});

test("the dashboard exposes standalone code creation only to system admins", () => {
  state.global = true;
  const html = renderToStaticMarkup(<AdminDashboard />);
  expect(html.includes('href="/admin/codes/new"')).toBe(true);
  expect(html).toContain("New code block");
  state.global = false;
  expect(renderToStaticMarkup(<AdminDashboard />)).not.toContain(
    'href="/admin/codes/new"',
  );
});

test("the dashboard collapses events 14+ days old behind a view-more button", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 7, 12));
  const event = (id: string, eventDate?: string) => ({
    _id: id as Id<"events">,
    _creationTime: 0,
    name: `Event ${id}`,
    slug: id,
    description: undefined,
    eventDate,
    hidden: undefined,
    dynamic: undefined,
  });
  try {
    state.events = [
      event("upcoming", "2026-09-10"),
      event("undated"),
      event("recent", "2026-08-25"),
      event("boundary", "2026-08-24"),
      event("ancient", "2026-01-01"),
    ];
    const html = renderToStaticMarkup(<AdminDashboard />);
    for (const id of ["upcoming", "undated", "recent"]) {
      expect(html).toContain(`href="/admin/events/${id}"`);
    }
    expect(html).not.toContain('href="/admin/events/boundary"');
    expect(html).not.toContain('href="/admin/events/ancient"');
    expect(html).toContain("View 2 older events");
    expect(html).not.toContain("Older events");
    expect(html.indexOf("Past events")).toBeLessThan(html.indexOf("View 2 older events"));

    state.events = [event("upcoming", "2026-09-10")];
    expect(renderToStaticMarkup(<AdminDashboard />)).not.toContain("older event");
  } finally {
    vi.useRealTimers();
  }
});

test("the codes page opens a library with an explicit create action", () => {
  const html = renderToStaticMarkup(<CodeStudioPage />);
  expect(html.includes("Code blocks")).toBe(true);
  expect(html.includes('href="/admin/codes/new"')).toBe(true);
  expect(html).toContain("No code blocks yet");
  expect(html).not.toContain("Review and generate");
});

test("standalone creation explains that no event or separate save step is required", () => {
  const html = renderToStaticMarkup(<StripeCodeStudio />);
  expect(html.includes("No event required")).toBe(true);
  expect(html.includes("saved automatically")).toBe(true);
  expect(html).toContain("Review and save codes");
});

test("use saved explains automatic saving and links to creation without losing the event draft", () => {
  const html = renderToStaticMarkup(
    <SavedBatchPicker value="" onChange={() => {}} />,
  );
  expect(html.includes("saved automatically")).toBe(true);
  expect(html.includes('href="/admin/codes/new"')).toBe(true);
  expect(html).toContain('target="_blank"');
  expect(html).toContain("Create a code block");
});

test("new event form exposes all three code sources and keeps page settings optional", () => {
  const html = renderToStaticMarkup(<NewEventForm />);
  for (const label of [
    "Event details",
    "Generate new",
    "Use saved",
    "Add later",
    "Claim page settings",
    "Redemption instructions",
    ">None</button>",
    ">Pro</button>",
    ">Max</button>",
    ">Custom</button>",
    "Create event",
  ])
    expect(html).toContain(label);
  expect(html).toContain('maxLength="120"');
  expect(html).not.toContain("STRIPE_API_KEY");
});

test("new event form defaults to adding codes later", () => {
  const html = renderToStaticMarkup(<NewEventForm />);
  const selectedTabs = [...html.matchAll(/<button\b[^>]*aria-selected="true"[^>]*>([^<]*)<\/button>/g)].map(
    (match) => match[1],
  );
  expect(selectedTabs).toContain("Add later");
  expect(selectedTabs).not.toContain("Generate new");
  expect(html).toContain("Add codes when you’re ready");
  expect(html).not.toContain("Review and create");
  expect(html).not.toContain("Value per code (USD)");
});

test.each(["1", "2"])("generation fields offer only once and twice, with %s selected", (redemptionsPerCode) => {
  const html = renderToStaticMarkup(<StripeGenerationFields value={{ ...emptyStripeForm, redemptionsPerCode }} onChange={() => {}} />);
  const toggles = [...html.matchAll(/<button\b[^>]*data-slot="toggle-group-item"[^>]*>([^<]*)<\/button>/g)];
  expect(toggles.map((match) => match[1])).toEqual(["Once", "Twice"]);
  const selected = toggles.filter((match) => match[0].includes('aria-pressed="true"'));
  expect(selected.map((match) => match[1])).toEqual([redemptionsPerCode === "2" ? "Twice" : "Once"]);
  expect(html).toContain(`Each code can be redeemed ${redemptionsPerCode === "2" ? "twice" : "once"} in total at checkout.`);
});

test.each([1, 2] as const)("saved details and library display the %i-redemption limit", (redemptionsPerCode) => {
  const batch = { ...savedBlock(), redemptionsPerCode };
  state.detail = { ...batch, codes: [] };
  state.history = [batch];
  const label = `Redeem ${redemptionsPerCode === 2 ? "twice" : "once"} per code`;
  expect(renderToStaticMarkup(<CodeStudioPage batchId={batch._id} />)).toContain(label);
  expect(renderToStaticMarkup(<CodeStudioPage />)).toContain(label);
  expect(renderToStaticMarkup(<SavedBatchPicker value="" onChange={() => {}} />)).toContain(label);
});

test("generation fields cap quantity and batch name", () => {
  const html = renderToStaticMarkup(
    <StripeGenerationFields value={emptyStripeForm} onChange={() => {}} />,
  );
  expect(html).toContain("Value per code (USD)");
  expect(html).toContain('max="500"');
  expect(html).toContain('maxLength="40"');
});

test.each(["fields", "standalone"])("the generation %s place a four-letter optional prefix beside the batch name", (mode) => {
  const html = renderToStaticMarkup(
    mode === "fields" ? (
      <StripeGenerationFields value={emptyStripeForm} onChange={() => {}} />
    ) : (
      <StripeCodeStudio />
    ),
  );
  const prefixInput = [...html.matchAll(/<input\b[^>]*>/g)]
    .map((match) => match[0])
    .find((input) => input.includes('-prefix"'));
  expect(prefixInput).toContain('maxLength="4"');
  expect(prefixInput).toContain('pattern="[A-Za-z]{0,4}"');
  expect(prefixInput).not.toContain("required");
  expect(html.indexOf("Batch name")).toBeLessThan(html.indexOf("Code prefix"));
  expect(html.indexOf("Code prefix")).toBeLessThan(html.indexOf("Value per code"));
  expect(html).toContain("generate a 4-letter prefix");
  expect(html).not.toContain("Random codes with no prefix");
});

test("prefix previews use uppercase letters and invalid prefixes are explained", () => {
  const render = (prefix: string) => renderToStaticMarkup(
    <StripeGenerationFields value={{ ...emptyStripeForm, prefix }} onChange={() => {}} />,
  );
  expect(render("cAmp")).toContain("CAMP-XXXXXXXXXX");
  for (const prefix of ["ABCDE", "A1", "A-B"]) {
    const html = render(prefix);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("up to 4 letters");
  }
});

test.each(["CAMP", ""])("saved batch details display the persisted prefix %j", (prefix) => {
  const batch = savedBlock();
  state.detail = { ...batch, prefix, codes: [] };
  const html = renderToStaticMarkup(<CodeStudioPage batchId={batch._id} />);
  expect(html).toContain("Code prefix");
  expect(html).toContain(prefix || "None");
});

test("code studio shortens batch names prefilled from long event names", () => {
  const name = "N".repeat(100);
  const html = renderToStaticMarkup(<StripeCodeStudio eventName={name} />);
  expect(html).toContain(`value="${name.slice(0, 40)}"`);
  expect(html).not.toContain(`value="${name}"`);
});

test("the batch-name placeholder previews the shortened event name", () => {
  const name = "N".repeat(100);
  const html = renderToStaticMarkup(
    <StripeGenerationFields
      value={emptyStripeForm}
      onChange={() => {}}
      namePlaceholder={name}
    />,
  );
  expect(html).toContain(`placeholder="${name.slice(0, 40)}"`);
});

test("missing Stripe setup disables generation without removing the other event flows", () => {
  state.configured = false;
  const html = renderToStaticMarkup(<NewEventForm />);
  expect(html).toContain("Use saved");
  expect(html).toContain("Add later");
  expect(html).not.toContain("Stripe setup required");
  expect(html).not.toMatch(/<button type="submit"[^>]*\sdisabled=""/);
  const studio = renderToStaticMarkup(<StripeCodeStudio />);
  expect(studio).toContain("Stripe setup required");
  expect(studio).not.toContain("Value per code (USD)");
});
