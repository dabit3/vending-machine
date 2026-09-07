import SystemAdminGate from "@/components/SystemAdminGate";
import CodeStudioPage from "@/components/CodeStudioPage";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; batch?: string }>;
}) {
  const { event, batch } = await searchParams;
  return (
    <SystemAdminGate>
      <CodeStudioPage
        eventId={typeof event === "string" ? event : undefined}
        batchId={typeof batch === "string" ? batch : undefined}
      />
    </SystemAdminGate>
  );
}
