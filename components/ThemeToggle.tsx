"use client";

import { useTheme } from "next-themes";

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="group flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        className="size-4.5 -rotate-90 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90 motion-reduce:transition-none dark:rotate-0"
      >
        <mask id="theme-toggle-moon-mask">
          <rect width="24" height="24" fill="white" />
          <circle
            cx="30"
            cy="6"
            r="6"
            fill="black"
            className="transition-[cx,cy] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none dark:[cx:17] dark:[cy:7]"
          />
        </mask>
        <circle
          cx="12"
          cy="12"
          r="5"
          fill="currentColor"
          mask="url(#theme-toggle-moon-mask)"
          className="transition-[r] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none dark:[r:8]"
        />
        <g
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className="transition-opacity duration-300 motion-reduce:transition-none dark:opacity-0"
        >
          {RAY_ANGLES.map((angle) => (
            <line
              key={angle}
              x1="12"
              y1="3.5"
              x2="12"
              y2="1.5"
              transform={`rotate(${angle} 12 12)`}
              className="origin-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none dark:scale-0"
            />
          ))}
        </g>
      </svg>
    </button>
  );
}
