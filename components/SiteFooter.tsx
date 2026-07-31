import BrandMark from "@/components/BrandMark";
import DevinCredit from "@/components/DevinCredit";
import { getAppName } from "@/lib/app-name";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a
          href="https://devin.ai"
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-2 rounded-sm text-muted-dim transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BrandMark className="size-4 shrink-0" />
          <span className="truncate text-xs font-medium">{getAppName()}</span>
        </a>
        <DevinCredit />
      </div>
    </footer>
  );
}
