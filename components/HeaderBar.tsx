// Site-wide sticky nav bar: a frosted, borderless strip that's present from
// first paint. Page content (like the home hero scene) runs underneath and
// shows through the half-strength fill and blur — no scroll state, so it
// renders on the server with zero client JS.
export default function HeaderBar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 bg-background/30 backdrop-blur-md">
      {children}
    </header>
  );
}
