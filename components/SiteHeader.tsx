import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import HeaderAuth from "@/components/HeaderAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAppName } from "@/lib/app-name";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <BrandMark className="size-5 transition-transform duration-300 group-hover:-rotate-6" />
          <span className="eyebrow text-foreground transition-colors group-hover:text-brand">
            {getAppName()}
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <HeaderAuth />
        </nav>
      </div>
    </header>
  );
}
