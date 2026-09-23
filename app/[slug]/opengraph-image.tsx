import { fetchEventMeta } from "@/lib/event-meta";
import { formatEventDate } from "@/lib/event-date";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  homeCard,
  renderOgImage,
} from "@/lib/og-image";

export const alt = "Sign in to claim your credits.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await fetchEventMeta(slug);
  if (!event) return renderOgImage(homeCard());
  return renderOgImage({
    eyebrow: event.eventDate
      ? formatEventDate(event.eventDate)
      : homeCard().eyebrow,
    title: event.name,
    subtitle: event.description ?? "Sign in to claim your credits.",
  });
}
