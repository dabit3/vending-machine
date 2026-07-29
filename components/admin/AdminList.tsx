"use client";

import { X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Admin = {
  _id: Id<"admins">;
  email: string;
  isSelf: boolean;
};

export default function AdminList({
  admins,
  onRemove,
}: {
  admins?: Admin[];
  onRemove: (id: Id<"admins">) => void;
}) {
  if (admins === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {admins.map((admin) => (
        <li
          key={admin._id}
          className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-surface"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="truncate font-mono text-sm">{admin.email}</span>
            {admin.isSelf ? (
              <Badge
                variant="outline"
                className="eyebrow shrink-0 border-brand/40 text-brand"
              >
                You
              </Badge>
            ) : null}
          </span>
          {admin.isSelf ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${admin.email}`}
                    className="shrink-0 text-muted-foreground"
                  />
                }
              >
                <X />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove yourself?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will immediately lose admin access, and only another
                    admin can add you back.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => onRemove(admin._id)}
                  >
                    Remove me
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${admin.email}`}
              onClick={() => onRemove(admin._id)}
              className="shrink-0 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
