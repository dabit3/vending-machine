import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import AdminGate from "@/components/AdminGate";
import AdminNav from "@/components/AdminNav";
import BrandMark from "@/components/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="group flex items-center gap-2.5">
              <BrandMark className="size-[18px] transition-transform duration-300 group-hover:-rotate-6" />
              <span className="eyebrow text-foreground transition-colors group-hover:text-brand">
                Credit—Dispenser
              </span>
            </Link>
            <Badge
              variant="outline"
              className="eyebrow border-brand/40 text-brand"
            >
              Admin
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <AdminNav />
            <Separator orientation="vertical" className="!h-5" />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <AdminGate>{children}</AdminGate>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <span className="eyebrow text-muted-dim">Control room</span>
          <span className="eyebrow text-muted-dim">Credit—Dispenser</span>
        </div>
      </footer>
    </div>
  );
}
