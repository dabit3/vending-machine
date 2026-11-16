import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import BulkApproveFlagged from "../components/BulkApproveFlagged";

test("labels bulk approval as all entries only when the whole list is displayed", () => {
  const entries = [{ _id: "flag" as Id<"flaggedEmails"> }];
  const onApprove = vi.fn();
  const render = (hasMore: boolean) => renderToStaticMarkup(
    <BulkApproveFlagged entries={entries} hasMore={hasMore} onApprove={onApprove} />,
  );
  expect(render(false)).toContain("Approve all (1)");
  expect(render(true)).toContain("Approve displayed (1)");
  expect(render(true)).not.toContain("Approve all");
  expect(onApprove).not.toHaveBeenCalled();
});

test("an empty review list cannot be bulk approved", () => {
  const html = renderToStaticMarkup(
    <BulkApproveFlagged entries={[]} hasMore={false} onApprove={vi.fn()} />,
  );
  expect(html).toContain("Approve all (0)");
  expect(html).toContain('disabled=""');
});
