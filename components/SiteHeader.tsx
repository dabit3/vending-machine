import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

export default function SiteHeader({ admin = false }: { admin?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <BrandMark className="size-[18px] transition-transform duration-300 group-hover:-rotate-6" />
          <span className="eyebrow text-foreground transition-colors group-hover:text-brand">
            Credit—Dispenser
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {admin ? (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/admin" />}
              nativeButton={false}
            >
              Admin
            </Button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
