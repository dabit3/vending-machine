import Link from "next/link";
import { SearchX } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader width="card" />
      <main
        id="main-content"
        className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dotgrid [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,black,transparent)]"
        />
        <div className="relative w-full max-w-md">
          <Empty className="border border-dashed border-border-strong py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>Page not found</EmptyTitle>
              <EmptyDescription>
                This page doesn&apos;t exist or the link may be incorrect.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                href="/"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Back to home
              </Link>
            </EmptyContent>
          </Empty>
        </div>
      </main>
      <SiteFooter width="card" />
    </div>
  );
}
