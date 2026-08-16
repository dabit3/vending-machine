"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function AdminNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const access = useQuery(
    api.admins.accessLevel,
    isAuthenticated ? {} : "skip"
  );

  // The global admin list is only relevant (and only accessible) to global admins.
  const links = [
    { href: "/admin", label: "Events" },
    ...(access?.isGlobalAdmin
      ? [
          { href: "/admin/admins", label: "Admins" },
          { href: "/admin/blacklist", label: "Blacklist" },
        ]
      : []),
  ];

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin" || pathname.startsWith("/admin/events")
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:px-3",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
      {/* Sits where the Admins link will land, so the nav doesn't widen
          (and push the user button) once `access` resolves. */}
      {isAuthenticated && access === undefined ? (
        <Skeleton className="h-8 w-[4.5rem] rounded-md" />
      ) : null}
    </nav>
  );
}
