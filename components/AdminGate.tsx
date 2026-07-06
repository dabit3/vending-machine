"use client";

import { ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";

export default function AdminGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const isAdmin = useQuery(api.admins.isAdmin, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && isAdmin === undefined)) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    const email = user?.primaryEmailAddress?.emailAddress;
    return (
      <div className="rounded-lg border border-dashed border-border-strong p-12 text-center">
        <p className="text-sm font-medium">Not an admin</p>
        <p className="mt-2 text-sm text-muted">
          {email ? (
            <>
              You&apos;re signed in as{" "}
              <span className="font-mono">{email}</span>, which isn&apos;t on
              the admin list.
            </>
          ) : (
            "Your account isn't on the admin list."
          )}{" "}
          Ask an existing admin to add your email.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
