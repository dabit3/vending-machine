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
  const isAdmin = useQuery(api.admins.isAdmin, isAuthenticated ? {} : "skip");

  if (isLoading) {
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
            className="text-muted-dim transition-all group-hover/button:translate-x-0.5 group-hover/button:text-brand"
          />
        </Button>
      </SignInButton>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {isAdmin ? (
        <Button
          variant="ghost"
          size="sm"
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
