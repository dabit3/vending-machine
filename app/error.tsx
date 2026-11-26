"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandWordmark } from "@/components/BrandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-error-report";
import { cn } from "@/lib/utils";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "route");
  }, [error]);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center px-6 py-16"
    >
      <div className="mb-8">
        <BrandWordmark />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        We hit an unexpected error loading this page. Try again, or head back to
        the home page.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Go home
        </Link>
      </div>
    </main>
  );
}
