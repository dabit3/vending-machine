import WalkUpClaim from "@/components/WalkUpClaim";
import type { Id } from "@/convex/_generated/dataModel";

export default async function WalkUpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WalkUpClaim id={id as Id<"events">} />;
}
