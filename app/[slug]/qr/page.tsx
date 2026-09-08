import EventQrPage from "@/components/EventQrPage";

export default async function EventQrRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <EventQrPage slug={slug} />;
}
