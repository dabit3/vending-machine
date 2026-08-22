import ClaimPage from "@/components/ClaimPage";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  return <ClaimPage slug={slug} preview={preview !== undefined} />;
}
