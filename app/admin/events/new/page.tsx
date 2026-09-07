import NewEventForm from "@/components/NewEventForm";
import SystemAdminGate from "@/components/SystemAdminGate";
import type { Id } from "@/convex/_generated/dataModel";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch } = await searchParams;
  const batchId =
    typeof batch === "string" && /^[a-z0-9]{32}$/.test(batch)
      ? (batch as Id<"stripeBatches">)
      : undefined;
  return (
    <SystemAdminGate>
      <NewEventForm initialBatchId={batchId} />
    </SystemAdminGate>
  );
}
