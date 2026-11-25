import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";
import ClaimPage from "../components/ClaimPage";
import { SignInHint } from "../components/SignInHint";
import { AllowedDomainsField } from "../components/EventFormFields";

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
  allowedDomains?: string[];
  identity: "email" | "x";
  signInMessage?: string;
  contactEmail?: string;
  claimMode: "one" | "all";
  codeTypes: string[];
  codeTypeValues?: Record<string, string>;
  codeTypeTerms?: Record<string, { durationMonths?: number; redemptionsPerCode?: number }>;
  soldOut: boolean;
  viewerIsAdmin: boolean;
};

type MockEligibility =
  | {
      eligible: true;
      identity: string;
      instructionsViewed: boolean;
      claimed?: undefined;
    }
  | {
      eligible: false;
      reason: "wrong_domain" | "not_listed";
      identity: string;
      allowedDomains?: string[];
    };

const state = vi.hoisted(() => ({
  signedIn: true,
  event: null as MockEvent | null,
  eligibility: null as MockEligibility | null,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.signedIn, isLoading: false }),
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
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: state.signedIn,
    userId: state.signedIn ? "user_1" : null,
  }),
  useUser: () => ({
    user: state.signedIn
      ? {
          fullName: "Alice Smith",
          primaryEmailAddress: { emailAddress: "alice@gmail.com" },
        }
      : null,
  }),
}));

vi.mock("../components/SiteHeader", () => ({ default: () => <header /> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer /> }));

beforeEach(() => {
  state.signedIn = true;
  state.event = {
    _id: "ev_acme",
    name: "Acme Corp",
    slug: "acme",
    identity: "email",
    allowedDomains: ["acme.com", "acme.io"],
    claimMode: "one",
    codeTypes: [""],
    soldOut: false,
    viewerIsAdmin: false,
  };
  state.eligibility = {
    eligible: false,
    reason: "wrong_domain",
    identity: "alice@gmail.com",
    allowedDomains: ["acme.com", "acme.io"],
  };
});

test("signed-out company domain claim page prompts employees to sign in with their work email", () => {
  const html = renderToStaticMarkup(
    <SignInHint identity="email" allowedDomains={["acme.com"]} />
  );
  expect(html).toContain("Sign in with your @acme.com work email");
  expect(html).toContain("Only verified @acme.com email addresses can claim");
});

test("wrong-domain signed-in user sees a clear domain mismatch message", () => {
  const html = renderToStaticMarkup(<ClaimPage slug="acme" />);
  expect(html).toContain("Sign in with your @acme.com or @acme.io email");
  expect(html).toContain("alice@gmail.com");
  expect(html).toContain("allowed company domain");
});

test("eligible company domain user sees the name field to claim", () => {
  state.eligibility = {
    eligible: true,
    identity: "alice@acme.com",
    instructionsViewed: true,
  };
  const html = renderToStaticMarkup(<ClaimPage slug="acme" />);
  expect(html).toContain("Your name");
  expect(html).toContain("Dispense my code");
});

test("AllowedDomainsField renders parsed badges, errors for emails, and public provider warning", () => {
  const validHtml = renderToStaticMarkup(
    <AllowedDomainsField id="domains" value="acme.com, acme.io" onChange={() => {}} />
  );
  expect(validHtml).toContain("@acme.com");
  expect(validHtml).toContain("@acme.io");
  expect(validHtml).not.toContain("public email provider");

  const errorHtml = renderToStaticMarkup(
    <AllowedDomainsField id="domains" value="alice@acme.com" onChange={() => {}} />
  );
  expect(errorHtml).toContain("not a full email address");

  const publicHtml = renderToStaticMarkup(
    <AllowedDomainsField id="domains" value="gmail.com" onChange={() => {}} />
  );
  expect(publicHtml).toContain("public email provider");
});
