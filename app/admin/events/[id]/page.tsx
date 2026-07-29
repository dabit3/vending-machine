import ManageEvent from "@/components/ManageEvent";
import type { Id } from "@/convex/_generated/dataModel";

export default async function AdminEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ManageEvent id={id as Id<"events">} key={id} />;
}
