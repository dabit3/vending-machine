import Link from "next/link";
import { BrandWordmark } from "@/components/BrandMark";
import HeaderAuth from "@/components/HeaderAuth";
import HeaderBar from "@/components/HeaderBar";
import { getAppName } from "@/lib/app-name";

export default function SiteHeader() {
  return (
    <HeaderBar>
      <div className="mx-auto flex h-15.25 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={`${getAppName()} home`}
          className="group flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BrandWordmark />
        </Link>
        <nav aria-label="Account" className="flex shrink-0 items-center gap-2">
          <HeaderAuth />
        </nav>
      </div>
    </HeaderBar>
  );
}
