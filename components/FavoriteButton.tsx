"use client";

import { Star } from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Stars or unstars an event for the signed-in viewer. Starred events are
// pinned to the top of the home page and the admin dashboard.
export default function FavoriteButton({
  eventId,
  eventName,
  favorite,
  className,
}: {
  eventId: string;
  eventName: string;
  favorite: boolean;
  className?: string;
}) {
  const setFavorite = useMutation(api.favorites.set).withOptimisticUpdate(
    (store, args) => {
      const managed = store.getQuery(api.events.listManaged, {});
      if (managed) {
        store.setQuery(
          api.events.listManaged,
          {},
          managed.map((event) =>
            event._id === args.eventId
              ? { ...event, favorite: args.favorite }
              : event,
          ),
        );
      }
      const mine = store.getQuery(api.events.mine, {});
      if (mine) {
        store.setQuery(
          api.events.mine,
          {},
          mine.map((event) =>
            event._id === args.eventId
              ? { ...event, favorite: args.favorite }
              : event,
          ),
        );
      }
      const starred = store.getQuery(api.favorites.mine, {});
      if (starred && !args.favorite) {
        store.setQuery(
          api.favorites.mine,
          {},
          starred.filter((event) => event._id !== args.eventId),
        );
      }
    },
  );
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={favorite}
      aria-label={favorite ? `Unstar ${eventName}` : `Star ${eventName}`}
      title={favorite ? "Unstar" : "Star to pin to the top"}
      className={cn(
        "shrink-0 text-muted-dim hover:text-foreground",
        favorite && "text-brand hover:text-brand",
        className,
      )}
      onClick={async () => {
        try {
          await setFavorite({
            eventId: eventId as Id<"events">,
            favorite: !favorite,
          });
        } catch (error) {
          toast.error(
            error instanceof Error && "data" in error
              ? String(error.data)
              : "Could not update the star",
          );
        }
      }}
    >
      <Star className={cn(favorite && "fill-current")} aria-hidden />
    </Button>
  );
}
