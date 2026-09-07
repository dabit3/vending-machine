"use client";

import type { ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function SystemAdminGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(
    api.admins.accessLevel,
    isAuthenticated ? {} : "skip",
  );
  if (isLoading || (isAuthenticated && access === undefined))
    return <Skeleton className="h-64 w-full" />;
  if (!access?.isGlobalAdmin) {
    return (
      <Alert>
        <ShieldCheck />
        <AlertTitle>System admins only</AlertTitle>
        <AlertDescription>
          Creating events and generating Stripe codes requires system-wide admin
          access with a verified email. Event admin access is not sufficient.
        </AlertDescription>
      </Alert>
    );
  }
  return children;
}
