import { SignUp } from "@clerk/nextjs";
import { safeReturnPath } from "@/lib/return-url";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

// Clerk's sign-up pages must live at a real route. Without one, Clerk falls
// back to the hosted Account Portal for sign-up and the OAuth callback of the
// "Create an account" modal leaves the site, and any hop to /sign-up lands on
// the event route, which reports "Event not found".
// `redirect_url` is set by the admin route protection in proxy.ts (and by
// Clerk's own hops between sign-in and sign-up). Passing it as the forced
// redirect means the walk-up page, or any admin link, comes back after
// signing in instead of the app-wide after-sign-in destination.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const returnTo = safeReturnPath((await searchParams).redirect_url);
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
          <SignUp
            forceRedirectUrl={returnTo}
            signInForceRedirectUrl={returnTo}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
