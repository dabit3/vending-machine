"use client";

import { ReactNode } from "react";
import { ShieldX } from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function AdminGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const access = useQuery(
    api.admins.accessLevel,
    isAuthenticated ? {} : "skip"
  );

  if (isLoading || (isAuthenticated && access === undefined)) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  if (!isAuthenticated || !access?.hasEventAccess) {
    const email = user?.primaryEmailAddress?.emailAddress;
    return (
      <Empty className="border border-dashed border-border-strong py-20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldX />
          </EmptyMedia>
          <EmptyTitle>Not an admin</EmptyTitle>
          <EmptyDescription>
            {email ? (
              <>
                You&apos;re signed in as{" "}
                <span className="text-foreground">{email}</span>,
                which isn&apos;t an admin of anything.
              </>
            ) : (
              "Your account isn't an admin of anything."
            )}{" "}
            Ask an existing admin to add your email — globally or to a
            specific event.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <>{children}</>;
}
