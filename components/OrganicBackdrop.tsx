import { cn } from "@/lib/utils";

/* Ambient botanical backdrop: a few soft, slowly-breathing blobs in theme
   tints plus a faint hand-drawn branch in one corner. Purely decorative —
   always render behind content with pointer-events disabled. */
export default function OrganicBackdrop({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <div className="blob absolute -top-24 -left-20 h-80 w-96 bg-brand/15 blur-2xl motion-reduce:animate-none" />
      <div className="blob absolute top-1/3 -right-28 h-96 w-[28rem] bg-secondary/80 blur-2xl [animation-delay:-6s] motion-reduce:animate-none" />
      <div className="blob absolute -bottom-32 left-1/4 h-72 w-80 bg-brand/10 blur-3xl [animation-delay:-12s] motion-reduce:animate-none" />
      <BranchSketch className="absolute right-6 bottom-4 h-40 w-40 text-brand/25 sm:right-12 sm:h-56 sm:w-56" />
    </div>
  );
}

/* A loose, hand-drawn branch with leaves — irregular strokes on purpose. */
function BranchSketch({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 112 C 34 88, 52 66, 78 42 C 88 33, 98 24, 106 14" />
      <path d="M50 70 C 42 62, 40 52, 44 44 C 54 46, 60 54, 58 63 C 55 67, 52 69, 50 70 Z" />
      <path d="M72 48 C 78 36, 88 32, 97 34 C 96 44, 88 52, 78 52 C 75 51, 73 50, 72 48 Z" />
      <path d="M34 90 C 24 86, 18 78, 19 68 C 29 68, 37 75, 38 84 C 37 87, 35 89, 34 90 Z" />
      <path d="M88 30 C 87 22, 90 14, 97 10 C 102 16, 101 25, 95 30 C 92 31, 90 31, 88 30 Z" />
    </svg>
  );
}
