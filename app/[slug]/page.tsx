import type { Metadata } from "next";
import ClaimPage from "@/components/ClaimPage";
import { getAppName } from "@/lib/app-name";
import { fetchEventMeta } from "@/lib/event-meta";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEventMeta(slug);
  if (!event) return {};
  const title = `${event.name} · ${getAppName()}`;
  const description = event.description ?? "Sign in to claim your credits.";
  return {
    title,
    description,
    openGraph: { title, description, url: `/${slug}` },
    twitter: { title, description },
  };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  return <ClaimPage slug={slug} preview={preview !== undefined} />;
}
