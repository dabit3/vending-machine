"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function HeaderAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const access = useQuery(
    api.admins.accessLevel,
    isAuthenticated ? {} : "skip"
  );

  // Hold the skeleton until `access` resolves too, otherwise the header renders
  // without the Admin button and then reflows once the query lands.
  if (isLoading || (isAuthenticated && access === undefined)) {
    return <Skeleton className="h-7 w-20 rounded-md" />;
  }

  if (!isAuthenticated) {
    return (
      <SignInButton mode="modal">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Sign in
          <ArrowRight
            data-icon="inline-end"
            aria-hidden
            className="text-muted-dim transition-all group-hover/button:translate-x-0.5 group-hover/button:text-foreground"
          />
        </Button>
      </SignInButton>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        render={<Link href="/my-codes" />}
        nativeButton={false}
      >
        My codes
      </Button>
      {access?.hasEventAccess ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          render={<Link href="/admin" />}
          nativeButton={false}
        >
          Admin
        </Button>
      ) : null}
      <UserButton />
    </div>
  );
}
