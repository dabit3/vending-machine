import { SignIn } from "@clerk/nextjs";
import SiteHeader from "@/components/SiteHeader";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <SignIn />
      </main>
    </div>
  );
}
