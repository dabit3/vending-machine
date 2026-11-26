import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventQrPage from "@/components/EventQrPage";
import { getAppName } from "@/lib/app-name";
import { lookupEventMeta } from "@/lib/event-meta";

type Props = {
  params: Promise<{ slug: string }>;
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
  return {
    title: `${result.event.name} QR · ${getAppName()}`,
    robots: NOINDEX_ROBOTS,
  };
}

export default async function EventQrRoute({ params }: Props) {
  const { slug } = await params;
  const result = await lookupEventMeta(slug);
  if (result.status === "not_found") {
    notFound();
  }
  return <EventQrPage slug={slug} />;
}
