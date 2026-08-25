// Site-wide sticky nav bar: a frosted strip ruled off with a thick bottom
// border. Page content (like the home hero scene) runs underneath and shows
// through the half-strength fill and blur — no scroll state, so it renders
// on the server with zero client JS.
export default function HeaderBar({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-background/30 backdrop-blur-md">
      {children}
    </header>
  );
}
