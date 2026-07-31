import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import AdminGate from "@/components/AdminGate";
import AdminNav from "@/components/AdminNav";
import BrandMark from "@/components/BrandMark";
import DevinCredit from "@/components/DevinCredit";
import ScrollAwareHeader from "@/components/ScrollAwareHeader";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getAppName } from "@/lib/app-name";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollAwareHeader>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="group flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <BrandMark className="size-5 shrink-0 transition-transform duration-300 group-hover:-rotate-6" />
              <span className="hidden truncate text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-muted-foreground sm:inline">
                {getAppName()}
              </span>
            </Link>
            <Badge
              variant="outline"
              className="shrink-0 border-border-strong text-muted-foreground"
            >
              Admin
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <AdminNav />
            <Separator
              orientation="vertical"
              className="hidden !h-5 sm:block"
            />
            <UserButton />
          </div>
        </div>
      </ScrollAwareHeader>
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12"
      >
        <AdminGate>{children}</AdminGate>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-xs font-medium text-muted-dim">
            Control room
          </span>
          <DevinCredit />
        </div>
      </footer>
    </div>
  );
}
