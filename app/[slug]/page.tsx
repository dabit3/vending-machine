import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClaimPage from "@/components/ClaimPage";
import { getAppName } from "@/lib/app-name";
import { lookupEventMeta } from "@/lib/event-meta";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

const NOINDEX_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await lookupEventMeta(slug);
  if (result.status !== "found") {
    return { robots: NOINDEX_ROBOTS };
  }
  const { event } = result;
  const title = `${event.name} · ${getAppName()}`;
  const description = event.description ?? "Sign in to claim your credits.";
  return {
    title,
    description,
    robots: NOINDEX_ROBOTS,
    openGraph: { title, description, url: `/${slug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const result = await lookupEventMeta(slug);
  if (result.status === "not_found") {
    notFound();
  }
  const { preview } = await searchParams;
  return <ClaimPage slug={slug} preview={preview !== undefined} />;
}
