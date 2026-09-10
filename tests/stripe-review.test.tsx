import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import StripeBatchDetails from "../components/StripeBatchDetails";
import { ConfirmStripeGeneration } from "../components/StripeGenerationFields";
import { downloadCsv } from "../lib/csv";

const state = vi.hoisted(() => ({
  batch: null as FunctionReturnType<typeof api.stripeBatches.get>,
  download: undefined as (() => void) | undefined,
}));

vi.mock("convex/react", () => ({
  useQuery: () => state.batch,
  useMutation: () => vi.fn(),
}));
vi.mock("../lib/csv", () => ({ downloadCsv: vi.fn() }));
vi.mock("../components/ui/alert-dialog", async (importOriginal) => ({
  ...await importOriginal<typeof import("../components/ui/alert-dialog")>(),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../components/ui/button", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/ui/button")>();
  return {
    ...actual,
    Button: (props: ComponentProps<typeof actual.Button>) => {
      if (Array.isArray(props.children) && props.children.includes("Download CSV"))
        state.download = props.onClick as () => void;
      return <actual.Button {...props} />;
    },
  };
});

beforeEach(() => {
  state.download = undefined;
  vi.clearAllMocks();
});

test.each([undefined, 1, 2])("confirmation includes the %j-redemption limit in the maximum discount", (redemptionsPerCode) => {
  const html = renderToStaticMarkup(<ConfirmStripeGeneration
    input={{ name: "Credits", amountCents: 5000, quantity: 7, redemptionsPerCode, expectedLive: true, confirmLive: true, requestId: "request-1234567890" }}
    busy={false}
    error={null}
    onCancel={() => {}}
    onConfirm={() => {}}
  />);
  expect(html).toContain("Redemptions per code");
  expect(html).toContain(`<dd>${redemptionsPerCode === 2 ? "Twice" : "Once"}</dd>`);
  expect(html).toContain(redemptionsPerCode === 2 ? "$700.00" : "$350.00");
  expect(html).toContain("These codes have real value");
});

test.each([1, 2] as const)("CSV exports the saved %i-redemption limit for every code", (redemptionsPerCode) => {
  const batchId = "a".repeat(32) as Id<"stripeBatches">;
  state.batch = {
    _id: batchId, _creationTime: 0, name: "Credits", prefix: "TEST", amountCents: 5000,
    quantity: 2, redemptionsPerCode, expiresAt: undefined, live: false, createdBy: "admin@example.com",
    status: "complete", generatedCount: 2, couponId: "coupon_test", error: undefined,
    eventId: "e".repeat(32) as Id<"events">, targetEventId: undefined, codeType: undefined,
    eventName: null, expired: false, canRetry: false,
    codes: [{ id: "promo_one", code: "TEST-ONE" }, { id: "promo_two", code: "TEST-TWO" }],
  };
  renderToStaticMarkup(<StripeBatchDetails batchId={batchId} />);
  expect(state.download).toBeTypeOf("function");
  state.download!();
  expect(downloadCsv).toHaveBeenCalledWith("Credits-codes.csv", [
    ["code", "promotion_code_id", "coupon_id", "amount_usd", "expires_at", "redemptions_per_code"],
    ["TEST-ONE", "promo_one", "coupon_test", "50", "", String(redemptionsPerCode)],
    ["TEST-TWO", "promo_two", "coupon_test", "50", "", String(redemptionsPerCode)],
  ]);
});
