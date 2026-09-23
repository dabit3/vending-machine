import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { markdownToPlainText } from "@/lib/markdown-plain";

export type EventMeta = {
  name: string;
  description?: string;
  eventDate?: string;
};

// Server-side event lookup for metadata and social cards. Any failure (no
// deployment URL, network, unknown slug) yields null so the page still
// renders with the generic site card.
export async function fetchEventMeta(slug: string): Promise<EventMeta | null> {
  try {
    const event = await fetchQuery(api.events.getBySlug, { slug });
    if (!event) return null;
    const plain = event.description
      ? markdownToPlainText(event.description).replace(/\s+/g, " ").trim()
      : "";
    const description = plain ? truncate(plain, 160) : undefined;
    return { name: event.name, description, eventDate: event.eventDate };
  } catch {
    return null;
  }
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
