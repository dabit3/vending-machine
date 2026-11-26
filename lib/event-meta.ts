import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { markdownToPlainText } from "@/lib/markdown-plain";
import { isValidEventSlug } from "@/lib/slug";

export type EventMeta = {
  name: string;
  description?: string;
  eventDate?: string;
  eventEndDate?: string;
};

export type EventMetaLookup =
  | { status: "found"; event: EventMeta }
  | { status: "not_found" }
  | { status: "error" };

// Request-scoped lookup so generateMetadata and the route component share one
// Convex query. Distinguishes a confirmed missing slug ("not_found", which
// triggers HTTP 404) from a missing deployment URL or transient network error
// ("error", which falls back to client-side rendering).
export const lookupEventMeta = cache(
  async (slug: string): Promise<EventMetaLookup> => {
    if (!isValidEventSlug(slug)) {
      return { status: "not_found" };
    }
    try {
      const event = await fetchQuery(api.events.getBySlug, { slug });
      if (!event) return { status: "not_found" };
      const plain = event.description
        ? markdownToPlainText(event.description).replace(/\s+/g, " ").trim()
        : "";
      const description = plain ? truncate(plain, 160) : undefined;
      return {
        status: "found",
        event: {
          name: event.name,
          description,
          eventDate: event.eventDate,
          eventEndDate: event.eventEndDate,
        },
      };
    } catch {
      return { status: "error" };
    }
  },
);

export async function fetchEventMeta(slug: string): Promise<EventMeta | null> {
  const result = await lookupEventMeta(slug);
  return result.status === "found" ? result.event : null;
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
