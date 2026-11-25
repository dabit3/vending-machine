import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";
import ClaimPage from "../components/ClaimPage";

type MockEvent = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  creditAmount?: string;
  eventDate?: string;
  eventEndDate?: string;
  claimInstructions?: string;
  dynamic?: boolean;
  identity: "email" | "x";
  signInMessage?: string;
  claimMessage?: string;
  contactEmail?: string;
  claimMode: "one" | "all";
  codeTypes: string[];
  codeTypeValues?: Record<string, string>;
  codeTypeTerms?: Record<string, { durationMonths?: number; redemptionsPerCode?: number }>;
  soldOut: boolean;
  viewerIsAdmin: boolean;
};

type MockEligibility = {
  eligible: true;
  identity: string;
  instructionsViewed: boolean;
  claimed?: undefined;
};

const state = vi.hoisted(() => ({
  event: null as MockEvent | null,
  eligibility: null as MockEligibility | null,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name === "events:getBySlug") return state.event;
    if (name === "claims:eligibility") return state.eligibility;
    return undefined;
  },
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user_1" }),
  useUser: () => ({
    user: {
      fullName: "Ada Lovelace",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    },
  }),
}));

vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer /> }));

beforeEach(() => {
  state.event = {
    _id: "ev_1",
    name: "Launch Event",
    slug: "launch",
    claimInstructions: "Pick Pro for new accounts, or Max for existing orgs.",
    identity: "email",
    claimMode: "one",
    codeTypes: ["Pro", "Max"],
    codeTypeValues: { Pro: "20", Max: "200" },
    soldOut: false,
    viewerIsAdmin: false,
  };
  state.eligibility = {
    eligible: true,
    identity: "ada@example.com",
    instructionsViewed: false,
  };
});

test("multi-choice events gate on reading redemption instructions before choosing a code", () => {
  const html = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(html).toContain("Before choosing your code, take a moment to read how to redeem it.");
  expect(html).toContain("Read how to redeem");
  // The button to open the instructions must be enabled without picking a code.
  expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*Read how to redeem/);
  expect(html).not.toContain("Choose your code type");
  expect(html).not.toContain("Dispense my code");
  expect(html).not.toContain("dispensed as soon as you open");
  // Shows the available code options and values ahead of the instructions.
  expect(html).toContain("Pro");
  expect(html).toContain("$20");
  expect(html).toContain("Max");
  expect(html).toContain("$200");
});

test("multi-choice events with no code values omit the values list on the pre-read screen", () => {
  state.event!.codeTypeValues = undefined;
  const html = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(html).toContain("Before choosing your code, take a moment to read how to redeem it.");
  expect(html).not.toContain("<ul");
});

test("after reading instructions, multi-choice events let the attendee choose and re-read steps", () => {
  state.eligibility!.instructionsViewed = true;
  const html = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(html).toContain("Choose your code type");
  expect(html).toContain("Dispense my code");
  expect(html).toContain("Redemption steps");
  expect(html).not.toContain("Before choosing your code");
});

test("single-code events keep the one-step read-and-dispense flow", () => {
  state.event!.codeTypes = [""];
  state.event!.codeTypeValues = undefined;
  const html = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(html).toContain("Your code is dispensed as soon as you open the redemption steps.");
  expect(html).toContain("Read how to redeem");
  expect(html).not.toContain("Before choosing your code");
});

test("dispense-all multi-block events keep the one-step read-and-dispense flow", () => {
  state.event!.claimMode = "all";
  const html = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(html).toContain("You get both codes");
  expect(html).toContain("Your codes are dispensed as soon as you open the redemption steps.");
  expect(html).toContain("Read how to redeem");
  expect(html).not.toContain("Before choosing your code");
});

test("custom claimMessage replaces the default eligible-attendee message", () => {
  state.event!.claimMessage = "Welcome! Open the steps to claim your **Devin** credit.";
  const multiHtml = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(multiHtml).toContain("<strong>Devin</strong>");
  expect(multiHtml).not.toContain("Before choosing your code");

  state.event!.codeTypes = [""];
  state.event!.codeTypeValues = undefined;
  const singleHtml = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(singleHtml).toContain("<strong>Devin</strong>");
  expect(singleHtml).not.toContain("dispensed as soon as you open the redemption steps");

  state.event!.claimInstructions = undefined;
  const noInstructionsHtml = renderToStaticMarkup(<ClaimPage slug="launch" />);
  expect(noInstructionsHtml).toContain("<strong>Devin</strong>");
  expect(noInstructionsHtml).toContain("Dispense my code");
});
