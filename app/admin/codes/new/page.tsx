import SystemAdminGate from "@/components/SystemAdminGate";
import CodeStudioPage from "@/components/CodeStudioPage";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const { event } = await searchParams;
  return (
    <SystemAdminGate>
      <CodeStudioPage
        mode="create"
        eventId={typeof event === "string" ? event : undefined}
      />
    </SystemAdminGate>
  );
}
