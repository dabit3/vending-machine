// Logo mark: a dispenser slot ejecting a receipt with a torn edge.
// Body strokes inherit currentColor; the receipt is always brand lime.
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="3.25"
        y="2.75"
        width="17.5"
        height="18.5"
        rx="3.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.75 7.75h10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8.75 7.75h6.5v7.25l-1.08 1.25-1.09-1.25-1.08 1.25-1.08-1.25-1.09 1.25-1.08-1.25z"
        className="fill-brand"
      />
    </svg>
  );
}
