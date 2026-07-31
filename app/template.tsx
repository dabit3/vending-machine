// Remounts on navigation, giving every route a brief fade-in so page changes
// feel finished rather than cut. Opacity only — no translate — so the sticky
// header doesn't visibly jump.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in duration-300 motion-reduce:animate-none">
      {children}
    </div>
  );
}
