import ShowcasePage from "@/components/ShowcasePage";

export default async function EventShowcasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ShowcasePage slug={slug} />;
}
