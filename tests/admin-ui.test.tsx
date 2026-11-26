import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { beforeEach, expect, test, vi } from "vitest";
import SystemAdminGate from "../components/SystemAdminGate";
import AdminNav from "../components/AdminNav";
import NewEventForm from "../components/NewEventForm";
import { DynamicEventWarning } from "../components/DynamicEventWarning";
import { EventOptionalSettings } from "../components/EventOptionalSettings";
import { CLAIM_INSTRUCTION_PRESETS } from "../lib/claim-instructions";
import AdminDashboard from "../app/admin/page";
import CodeStudioPage from "../components/CodeStudioPage";
import { SavedBatchPicker } from "../components/StripeBatchDetails";
import StripeCodeStudio from "../components/StripeCodeStudio";
import { StripeGenerationFields } from "../components/StripeGenerationFields";
import { emptyStripeForm } from "../lib/stripe-form";
import NewCodeBlockPage from "../app/admin/codes/new/page";
import { openSavedPreview, PreviewClaimButton } from "../components/ManageEvent";

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
  dashboardStats: {} as Record<
    string,
    {
      totalCodes: number;
      claimedCodes: number;
      remainingCodes: number;
      pendingRequests: number;
      flaggedCount: number;
      stripeClaimedCodes: number;
      stripeRedeemedCodes: number;
      stripeSyncedCodes: number;
      stripeRedemptionSyncedAt?: number;
      stripeRedemptionSyncStatus?: "pending" | "done" | "failed";
    }
  >,
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
    if (getFunctionName(ref) === "events:dashboardStats")
      return state.dashboardStats;
    return undefined;
  },
  useQueries: (
    queries: Record<
      string,
      { query: Parameters<typeof getFunctionName>[0]; args: { eventIds?: string[] } }
    >,
  ) =>
    Object.fromEntries(
      Object.entries(queries).map(([key, req]) => {
        if (getFunctionName(req.query) === "events:dashboardStats") {
          const ids = req.args.eventIds ?? [];
          return [
            key,
            Object.fromEntries(
              ids
                .filter((id) => id in state.dashboardStats)
                .map((id) => [id, state.dashboardStats[id]]),
            ),
          ];
        }
        return [key, undefined];
      }),
    ),
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate: () => vi.fn() }),
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
    dashboardStats: {},
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
    durationMonths: 1,
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

test("the dashboard leaves code block creation to the Codes tab", () => {
  state.global = true;
  const html = renderToStaticMarkup(<AdminDashboard />);
  expect(html).toContain('href="/admin/events/new"');
  expect(html).not.toContain('href="/admin/codes/new"');
  expect(html).not.toContain("New code block");
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
    adminNote: undefined,
    eventDate,
    eventEndDate: undefined,
    dynamic: undefined,
    allowedDomains: undefined,
    identity: "email" as const,
    favorite: false,
    archived: false,
    createdBy: undefined,
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

test("the dashboard shows who created an event when it is known", () => {
  const event = (id: string, createdBy?: string) => ({
    _id: id as Id<"events">,
    _creationTime: 0,
    name: `Event ${id}`,
    slug: id,
    description: undefined,
    adminNote: undefined,
    eventDate: undefined,
    eventEndDate: undefined,
    dynamic: undefined,
    allowedDomains: undefined,
    identity: "email" as const,
    favorite: false,
    archived: false,
    createdBy,
  });
  state.events = [event("tagged", "organizer@example.com")];
  expect(renderToStaticMarkup(<AdminDashboard />)).toContain(
    "Created by organizer@example.com",
  );
  state.events = [event("legacy")];
  expect(renderToStaticMarkup(<AdminDashboard />)).not.toContain("Created by");
});

test("the dashboard shows an event's date only when it has one", () => {
  const event = (id: string, eventDate?: string) => ({
    _id: id as Id<"events">,
    _creationTime: Date.UTC(2026, 2, 15, 12),
    name: `Event ${id}`,
    slug: id,
    description: undefined,
    adminNote: undefined,
    eventDate,
    eventEndDate: undefined,
    dynamic: undefined,
    allowedDomains: undefined,
    identity: "email" as const,
    favorite: false,
    archived: false,
    createdBy: undefined,
  });
  state.events = [event("undated")];
  const html = renderToStaticMarkup(<AdminDashboard />);
  expect(html).toContain('href="/admin/events/undated"');
  expect(html).not.toContain("Mar 15, 2026");
  expect(html).not.toContain("<time");
  state.events = [event("dated", "2099-07-04")];
  expect(renderToStaticMarkup(<AdminDashboard />)).toContain("Jul 4, 2099");
});

test("the dashboard renders a badge for company-domain events", () => {
  state.events = [
    {
      _id: "ev_acme" as Id<"events">,
      _creationTime: 0,
      name: "Acme Corp",
      slug: "acme",
      description: undefined,
    adminNote: undefined,
      eventDate: undefined,
      eventEndDate: undefined,
      dynamic: undefined,
      allowedDomains: ["acme.com", "acme.io"],
      identity: "email" as const,
      favorite: false,
      archived: false,
      createdBy: undefined,
    },
  ];
  const html = renderToStaticMarkup(<AdminDashboard />);
  expect(html).toContain("@acme.com +1");
});

test("the dashboard shows an event's admin note preview and NewEventForm includes Admin note", () => {
  state.events = [
    {
      _id: "ev_note" as Id<"events">,
      _creationTime: 0,
      name: "Partner Event",
      slug: "partner",
      description: undefined,
      adminNote: "Requested by Jane in [Slack](https://example.com) for Q4 workshop.",
      eventDate: undefined,
      eventEndDate: undefined,
      dynamic: undefined,
      allowedDomains: undefined,
      identity: "email" as const,
      favorite: false,
      archived: false,
      createdBy: undefined,
    },
  ];
  const dashboardHtml = renderToStaticMarkup(<AdminDashboard />);
  expect(dashboardHtml).toContain("Requested by Jane in Slack for Q4 workshop.");
  expect(dashboardHtml).not.toContain("https://example.com");

  const formHtml = renderToStaticMarkup(<NewEventForm />);
  expect(formHtml).toContain("Add admin note");
  expect(formHtml).toContain("Admins only");
  expect(formHtml).toContain("never shown to attendees");
});

test("the dashboard shows remaining codes, queues, low-stock alerts, and Stripe redemptions", () => {
  state.global = true;
  state.events = [
    {
      _id: "ev_empty" as Id<"events">,
      _creationTime: 0,
      name: "Sold Out Workshop",
      slug: "sold-out",
      description: undefined,
      adminNote: undefined,
      eventDate: undefined,
      eventEndDate: undefined,
      dynamic: undefined,
      allowedDomains: undefined,
      identity: "email" as const,
      favorite: false,
      archived: false,
      createdBy: undefined,
    },
    {
      _id: "ev_low" as Id<"events">,
      _creationTime: 0,
      name: "Low Stock Meetup",
      slug: "low-stock",
      description: undefined,
      adminNote: undefined,
      eventDate: undefined,
      eventEndDate: undefined,
      dynamic: undefined,
      allowedDomains: undefined,
      identity: "email" as const,
      favorite: false,
      archived: false,
      createdBy: undefined,
    },
    {
      _id: "ev_ok" as Id<"events">,
      _creationTime: 0,
      name: "Healthy Conference",
      slug: "healthy",
      description: undefined,
      adminNote: undefined,
      eventDate: undefined,
      eventEndDate: undefined,
      dynamic: undefined,
      allowedDomains: undefined,
      identity: "email" as const,
      favorite: false,
      archived: false,
      createdBy: undefined,
    },
  ];
  state.dashboardStats = {
    ev_empty: {
      totalCodes: 10,
      claimedCodes: 10,
      remainingCodes: 0,
      pendingRequests: 3,
      flaggedCount: 0,
      stripeClaimedCodes: 10,
      stripeRedeemedCodes: 7,
      stripeSyncedCodes: 10,
    },
    ev_low: {
      totalCodes: 50,
      claimedCodes: 47,
      remainingCodes: 3,
      pendingRequests: 0,
      flaggedCount: 2,
      stripeClaimedCodes: 0,
      stripeRedeemedCodes: 0,
      stripeSyncedCodes: 0,
    },
    ev_ok: {
      totalCodes: 40,
      claimedCodes: 10,
      remainingCodes: 30,
      pendingRequests: 0,
      flaggedCount: 0,
      stripeClaimedCodes: 0,
      stripeRedeemedCodes: 0,
      stripeSyncedCodes: 0,
    },
  };

  const html = renderToStaticMarkup(<AdminDashboard />);
  expect(html).toContain("Needs attention");
  expect(html).toContain("1 out of stock");
  expect(html).toContain("1 low stock");
  expect(html).toContain("3 pending requests");
  expect(html).toContain("2 flagged");
  expect(html).toContain("Filter (2)");
  expect(html).toContain("Out of stock (0/10)");
  expect(html).toContain("Low · 3/50 left");
  expect(html).toContain("30/40 left");
  expect(html).toContain("3 requests");
  expect(html).toContain("7/10 redeemed");
  expect(html).toContain("Sync Stripe redemptions");

  // Event admins see stock and queues but not the global Stripe sync button.
  state.global = false;
  const eventAdminHtml = renderToStaticMarkup(<AdminDashboard />);
  expect(eventAdminHtml).toContain("Out of stock (0/10)");
  expect(eventAdminHtml).toContain("3 requests");
  expect(eventAdminHtml).not.toContain("Sync Stripe redemptions");
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
    "Add description",
    "Set redemption instructions",
    "Set custom sign-in message",
    "Contact / support email",
    "Add organizers",
    "Create event",
  ])
    expect(html).toContain(label);
  // Empty optional settings start collapsed: no instruction tabs or textareas.
  for (const control of [">None</button>", ">Pro</button>", "<textarea"])
    expect(html).not.toContain(control);
  expect(html).toContain('maxLength="120"');
  expect(html).not.toContain("STRIPE_API_KEY");
});

test("dynamic warning is hidden until the box is ticked and spells out the consequences", () => {
  const form = renderToStaticMarkup(<NewEventForm />);
  expect(form).toContain("Participant list");
  expect(form).toContain("Company domain");
  expect(form).toContain("Anyone (dynamic)");
  expect(form).not.toContain("Warning: anyone with the link can take a code");
  const warning = renderToStaticMarkup(<DynamicEventWarning />);
  expect(warning).toContain('role="alert"');
  expect(warning).toContain("Warning: anyone with the link can take a code");
  expect(warning).toContain("skip the eligible-email list");
  expect(warning).not.toContain("home page");
});

test("new event organizers are a final optional section beside the create action", () => {
  const html = renderToStaticMarkup(<NewEventForm />);
  const organizerSection = html.indexOf("3. Organizers");
  const organizerInput = html.indexOf('id="event-organizer-email"');
  const submit = html.indexOf('type="submit"');

  const codeSection = html.indexOf("2. Choose your codes");
  expect(codeSection).toBeGreaterThan(0);
  expect(organizerSection).toBeGreaterThan(codeSection);
  expect(organizerInput).toBeGreaterThan(organizerSection);
  expect(submit).toBeGreaterThan(organizerInput);
  expect(html.slice(organizerInput, submit)).not.toContain('data-slot="card-title"');
  expect(html.slice(0, organizerSection)).not.toContain("Add organizers");
  expect(html).toContain("Optional. Give other admins access to this event.");
  const input = html.match(/<input[^>]*id="event-organizer-email"[^>]*>/)?.[0];
  expect(input).toContain('aria-describedby="event-organizer-help"');
  expect(input).not.toContain("required");
  expect(input).not.toContain("autofocus");
});

test("attendee settings use labeled responsive tiles with accessible expansion controls", () => {
  const html = renderToStaticMarkup(<NewEventForm />);
  const section = html.match(/<section[^>]*aria-labelledby="event-experience-heading"[\s\S]*?<\/section>/)?.[0];
  expect(section).toBeDefined();
  expect(section).toContain("Attendee experience");
  expect(section).toContain("sm:grid-cols-2");
  expect(section).toContain("A welcome and context for your event.");
  expect(section).toContain("Help attendees redeem their codes.");
  expect(section).toContain("A note to show before attendees sign in.");
  expect(section).toContain("A note shown to eligible attendees before claiming.");
  expect(section).toContain('value="support@cognition.ai"');
  for (const id of ["description", "instructions", "signin-message", "claim-message"]) {
    expect(section).toContain(`aria-controls="event-${id}-panel"`);
    expect(section).toContain(`id="event-${id}-panel" hidden=""`);
  }
  expect(section?.match(/aria-expanded="false"/g)).toHaveLength(4);
  expect(section).not.toContain('id="event-organizer-email"');
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
  const toggles = [...html.matchAll(/<button\b[^>]*data-slot="toggle-group-item"[^>]*>([^<]*)<\/button>/g)].slice(0, 2);
  expect(toggles.map((match) => match[1])).toEqual(["Once", "Twice"]);
  const selected = toggles.filter((match) => match[0].includes('aria-pressed="true"'));
  expect(selected.map((match) => match[1])).toEqual([redemptionsPerCode === "2" ? "Twice" : "Once"]);
  expect(html).toContain(`Each code can be redeemed ${redemptionsPerCode === "2" ? "twice" : "once"} in total at checkout.`);
});

test.each(["1", "3"])("duration field offers once or multiple months, with %s month(s)", (durationMonths) => {
  const html = renderToStaticMarkup(<StripeGenerationFields value={{ ...emptyStripeForm, durationMonths }} onChange={() => {}} />);
  const toggles = [...html.matchAll(/<button\b[^>]*data-slot="toggle-group-item"[^>]*>([^<]*)<\/button>/g)].slice(2);
  expect(toggles.map((match) => match[1])).toEqual(["Once", "Multiple months"]);
  const selected = toggles.filter((match) => match[0].includes('aria-pressed="true"'));
  expect(selected.map((match) => match[1])).toEqual([durationMonths === "1" ? "Once" : "Multiple months"]);
  if (durationMonths === "1") {
    expect(html).not.toContain('aria-label="Number of months"');
    expect(html).toContain("takes the value off one invoice");
  } else {
    expect(html).toContain('aria-label="Number of months"');
    expect(html).toContain("every monthly invoice for 3 months");
  }
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

test("new events have an enabled, editable support email by default", () => {
  const html = renderToStaticMarkup(<NewEventForm />);
  const input = [...html.matchAll(/<input\b[^>]*>/g)]
    .map((match) => match[0])
    .find((input) => input.includes('id="event-contact-email"'));
  expect(input).toContain('value="support@cognition.ai"');
  expect(input).not.toMatch(/\b(disabled|readOnly|required)=/);
  expect(html).not.toContain("Set contact / support email");
  expect(html).toContain("Remove");
});

test("sign-in message is collapsed into a single set-custom button by default", () => {
  const form = renderToStaticMarkup(<NewEventForm />);
  expect(form).toContain("Set custom sign-in message");
  expect(form).not.toContain("Default · shown before attendees sign in");
  expect(form).not.toContain("Sign in with the email you used for this event");
});

test("optional settings with a value render expanded with a clear action", () => {
  const html = renderToStaticMarkup(
    <EventOptionalSettings
      idPrefix="t"
      description=""
      onDescriptionChange={() => {}}
      instructions=""
      onInstructionsChange={() => {}}
      instructionsDescription="Read first."
      signInMessage="Use your work email."
      onSignInMessageChange={() => {}}
      claimMessage="Grab your credits below."
      onClaimMessageChange={() => {}}
      identity="email"
      contactEmail="help@example.com"
      onContactEmailChange={() => {}}
    />,
  );
  expect(html).toContain("Use your work email.");
  expect(html).toContain("Grab your credits below.");
  expect(html).toContain("Use default");
  expect(html).toContain('value="help@example.com"');
  expect(html).toContain("Remove");
  expect(html).toContain("Add description");
  expect(html).toContain("Set redemption instructions");
  expect(html).not.toContain("Set custom sign-in message");
  expect(html).not.toContain("Set custom claim message");
  expect(html).not.toContain("Set contact / support email");
});

test("redemption instructions come before the description in optional settings", () => {
  const html = renderToStaticMarkup(
    <EventOptionalSettings
      idPrefix="t"
      description=""
      onDescriptionChange={() => {}}
      instructions=""
      onInstructionsChange={() => {}}
      instructionsDescription="Read first."
      signInMessage=""
      onSignInMessageChange={() => {}}
      claimMessage=""
      onClaimMessageChange={() => {}}
      identity="email"
      contactEmail=""
      onContactEmailChange={() => {}}
    />,
  );
  expect(html.indexOf("Set redemption instructions")).toBeLessThan(
    html.indexOf("Add description"),
  );
});

test("saved redemption instructions show the chosen mode in the title with details folded", () => {
  const props = {
    idPrefix: "t",
    description: "",
    onDescriptionChange: () => {},
    onInstructionsChange: () => {},
    instructionsDescription: "Read first.",
    signInMessage: "",
    onSignInMessageChange: () => {},
    claimMessage: "",
    onClaimMessageChange: () => {},
    identity: "email" as const,
    favorite: false,
    contactEmail: "",
    onContactEmailChange: () => {},
  };
  const max = renderToStaticMarkup(
    <EventOptionalSettings
      {...props}
      instructions={CLAIM_INSTRUCTION_PRESETS.max.text}
    />,
  );
  expect(max).toContain("· Max");
  expect(max).toContain(">None<");
  expect(max).toContain("Show details");
  expect(max).toContain("Remove");
  expect(max).not.toContain('href="https://app.devin.ai/"');
  expect(max).not.toContain("Set redemption instructions");

  const custom = renderToStaticMarkup(
    <EventOptionalSettings {...props} instructions="Go to billing." />,
  );
  expect(custom).toContain("· Custom");
  expect(custom).not.toContain("Go to billing.");
});

test("PreviewClaimButton links directly when clean and prompts Save & preview when dirty", () => {
  const clean = renderToStaticMarkup(
    <PreviewClaimButton
      slug="launch"
      dirty={false}
      saving={false}
      onSaveAndPreview={() => {}}
    />,
  );
  expect(clean).toContain('href="/launch?preview=1"');
  expect(clean).toContain("Preview claim");
  expect(clean).not.toContain("Save &amp; preview");

  const dirty = renderToStaticMarkup(
    <PreviewClaimButton
      slug="launch"
      dirty={true}
      saving={false}
      onSaveAndPreview={() => {}}
    />,
  );
  expect(dirty).toContain("Save &amp; preview");
  expect(dirty).not.toContain('href="/launch?preview=1"');
  expect(dirty).not.toContain('disabled=""');

  const saving = renderToStaticMarkup(
    <PreviewClaimButton
      slug="launch"
      dirty={true}
      saving={true}
      onSaveAndPreview={() => {}}
    />,
  );
  expect(saving).toContain("Saving...");
  expect(saving).toContain('aria-busy="true"');
  expect(saving).toContain('disabled=""');
});

test("openSavedPreview validates first, saves, and opens the updated slug preview", async () => {
  const openTab = vi.fn();
  const invalidForm = {
    validate: vi.fn(() => false),
    save: vi.fn(async () => ({ ok: true as const, slug: "nope" })),
  };
  expect(await openSavedPreview(invalidForm, openTab)).toBe(false);
  expect(openTab).not.toHaveBeenCalled();
  expect(invalidForm.save).not.toHaveBeenCalled();

  const tab = {
    opener: {} as unknown,
    closed: false,
    close: vi.fn(),
    location: { replace: vi.fn() },
  };
  openTab.mockReturnValueOnce(tab);
  const failingForm = {
    validate: vi.fn(() => true),
    save: vi.fn(async () => ({ ok: false as const })),
  };
  expect(await openSavedPreview(failingForm, openTab)).toBe(false);
  expect(tab.opener).toBeNull();
  expect(tab.close).toHaveBeenCalledTimes(1);
  expect(tab.location.replace).not.toHaveBeenCalled();

  const okTab = {
    opener: {} as unknown,
    closed: false,
    close: vi.fn(),
    location: { replace: vi.fn() },
  };
  openTab.mockReturnValueOnce(okTab);
  const okForm = {
    validate: vi.fn(() => true),
    save: vi.fn(async () => ({ ok: true as const, slug: "renamed-launch" })),
  };
  expect(await openSavedPreview(okForm, openTab)).toBe(true);
  expect(okTab.opener).toBeNull();
  expect(okTab.location.replace).toHaveBeenCalledWith("/renamed-launch?preview=1");
  expect(okTab.close).not.toHaveBeenCalled();

  const blockedOpen = vi.fn(() => null);
  expect(await openSavedPreview(okForm, blockedOpen)).toBe(true);
  expect(blockedOpen).toHaveBeenNthCalledWith(1, "", "_blank");
  expect(blockedOpen).toHaveBeenNthCalledWith(
    2,
    "/renamed-launch?preview=1",
    "_blank",
    "noopener,noreferrer",
  );
});
