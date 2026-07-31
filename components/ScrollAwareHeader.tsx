"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Sticky header bar: the bottom border strengthens once the page scrolls, so
// the bar separates from whatever is passing underneath (e.g. the dot grid).
// Dark mode steps down one level (strong reads harsh on near-black): a faded
// hairline at rest, the regular hairline when scrolled.
export default function ScrollAwareHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md transition-colors duration-300",
        scrolled
          ? "border-border-strong dark:border-border"
          : "border-border dark:border-border/60",
      )}
    >
      {children}
    </header>
  );
}
