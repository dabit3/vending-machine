// "Built with Devin" credit. The logo PNG is applied as a CSS mask so it
// renders in currentColor — dim at rest, full ink on hover, like the eyebrows.
export default function DevinCredit() {
  return (
    <a
      href="https://github.com/dabit3/credit-dispenser"
      target="_blank"
      rel="noreferrer"
      className="group flex shrink-0 items-center gap-2 rounded-sm text-muted-dim transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span className="eyebrow">Built with</span>
      <span
        aria-hidden
        className="inline-block size-3.5 bg-current transition-transform duration-300 [mask-image:url(/devin-logo.png)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-hover:rotate-90"
      />
      <span className="eyebrow">Devin</span>
    </a>
  );
}
