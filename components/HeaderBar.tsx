// Site-wide sticky nav bar: a frosted strip finished with a hairline rule,
// present from first paint — no scroll state, so it renders on the server
// with zero client JS.
export default function HeaderBar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/75 backdrop-blur-md">
      {children}
    </header>
  );
}
