import Link from "next/link";
import { BrandWordmark } from "@/components/BrandMark";
import HeaderAuth from "@/components/HeaderAuth";
import HeaderBar from "@/components/HeaderBar";
import { getAppName } from "@/lib/app-name";
import { PAGE_WIDTHS, type PageWidth } from "@/lib/page-width";
import { cn } from "@/lib/utils";

export default function SiteHeader({
  width = "default",
  showSignIn = true,
}: {
  width?: PageWidth;
  // Pages with their own sign-in CTA (the home hero) drop the header's.
  showSignIn?: boolean;
}) {
  return (
    <HeaderBar>
      <div
        className={cn(
          "mx-auto flex h-15.25 items-center justify-between gap-4 px-4 sm:px-6",
          PAGE_WIDTHS[width]
        )}
      >
        <Link
          href="/"
          aria-label={`${getAppName()} home`}
          className="group flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BrandWordmark />
        </Link>
        <nav aria-label="Account" className="flex shrink-0 items-center gap-2">
          <HeaderAuth showSignIn={showSignIn} />
        </nav>
      </div>
    </HeaderBar>
  );
}
