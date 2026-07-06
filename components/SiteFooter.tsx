import BrandMark from "@/components/BrandMark";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <span className="flex items-center gap-2 text-muted-dim">
          <BrandMark className="size-4" />
          <span className="eyebrow">Credit—Dispenser</span>
        </span>
      </div>
    </footer>
  );
}
