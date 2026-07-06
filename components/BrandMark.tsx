// Logo mark: a dispenser slot ejecting a receipt with a torn edge.
// The slot bar inherits currentColor; the receipt is always brand blue.
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2.25 4h19.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M5.5 4h13v13.5l-2.17 2.5-2.17-2.5-2.17 2.5-2.16-2.5-2.17 2.5-2.16-2.5z"
        className="fill-brand"
      />
    </svg>
  );
}
