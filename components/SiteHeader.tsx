import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import HeaderAuth from "@/components/HeaderAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAppName } from "@/lib/app-name";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BrandMark className="size-5 shrink-0 transition-transform duration-300 group-hover:-rotate-6" />
          <span className="eyebrow max-w-36 truncate text-foreground transition-colors group-hover:text-muted-foreground sm:max-w-none">
            {getAppName()}
          </span>
        </Link>
        <nav aria-label="Account and appearance" className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <HeaderAuth />
        </nav>
      </div>
    </header>
  );
}
