"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Sticky header bar: a faint hairline at rest that firms up slightly once the
// page scrolls, so the bar separates from whatever is passing underneath
// (e.g. the dot grid) without ever reading as a hard rule.
// With `overlay`, the bar starts fully transparent — no fill, blur, or
// border — so a hero image can run to the top of the page behind it, then
// fades into the regular blurred bar as soon as the page scrolls.
export default function ScrollAwareHeader({
  children,
  overlay = false,
}: {
  children: React.ReactNode;
  overlay?: boolean;
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
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-border bg-background/80 backdrop-blur-md dark:border-border/70"
          : overlay
            ? "border-transparent bg-transparent backdrop-blur-[0px]"
            : "border-border/60 bg-background/80 backdrop-blur-md dark:border-border/40",
      )}
    >
      {children}
    </header>
  );
}
