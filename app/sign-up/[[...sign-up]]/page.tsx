import { SignUp } from "@clerk/nextjs";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

// Clerk's sign-up pages must live at a real route. Without one, Clerk falls
// back to the hosted Account Portal for sign-up and the OAuth callback of the
// "Create an account" modal leaves the site, and any hop to /sign-up lands on
// the event route, which reports "Event not found".
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        id="main-content"
        className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dotgrid [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,black,transparent)]"
        />
        <div className="relative flex flex-col items-center gap-3 text-center">
          <p className="eyebrow text-muted-foreground">New here?</p>
          <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
            Create your account
          </h1>
        </div>
        <div className="relative">
          <SignUp />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
