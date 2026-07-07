import BrandMark from "@/components/BrandMark";
import DevinCredit from "@/components/DevinCredit";
import { getAppName } from "@/lib/app-name";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <a
          href="https://devin.ai"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-muted-dim transition-colors hover:text-brand"
        >
          <BrandMark className="size-4" />
          <span className="eyebrow">{getAppName()}</span>
        </a>
        <DevinCredit />
      </div>
    </footer>
  );
}
