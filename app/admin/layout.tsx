import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import AdminGate from "@/components/AdminGate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 bg-foreground" />
              <span className="text-sm font-medium tracking-tight">
                Credit Dispenser
              </span>
            </Link>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Events
            </Link>
            <Link
              href="/admin/admins"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Admins
            </Link>
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <AdminGate>{children}</AdminGate>
      </main>
    </div>
  );
}
