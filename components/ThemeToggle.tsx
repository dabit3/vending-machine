"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="group flex h-8 cursor-pointer items-center gap-2 rounded-full px-2 font-mono text-[10px] font-medium tracking-[0.18em] uppercase text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex size-full rounded-full bg-amber-400 shadow-[0_0_8px_2px_var(--color-amber-400)] transition-opacity duration-500 group-hover:animate-pulse motion-reduce:animate-none dark:opacity-0" />
        <span className="inline-flex size-full rounded-full border border-border-strong transition-colors" />
      </span>
      <span className="hidden sm:inline">Lights</span>
      <span aria-hidden className="grid overflow-hidden text-left">
        <span className="[grid-area:1/1] transition-[translate,opacity] duration-300 motion-reduce:transition-none dark:-translate-y-2 dark:opacity-0">
          on
        </span>
        <span className="[grid-area:1/1] translate-y-2 opacity-0 transition-[translate,opacity] duration-300 motion-reduce:transition-none dark:translate-y-0 dark:opacity-100">
          off
        </span>
      </span>
    </button>
  );
}
