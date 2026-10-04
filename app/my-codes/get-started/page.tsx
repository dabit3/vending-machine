import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Cloud,
  Monitor,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CopyCommand from "@/components/CopyCommand";
import { getAppName } from "@/lib/app-name";

export const metadata: Metadata = {
  title: `Get started with Devin · ${getAppName()}`,
  description:
    "How to apply your Devin credit code, and where to start once it's active.",
  alternates: { canonical: "/my-codes/get-started" },
};

const PLANS_URL = "https://app.devin.ai/settings/plans";
const CLI_INSTALL = "curl -fsSL https://cli.devin.ai/install.sh | bash";

const linkClass =
  "font-medium text-foreground underline underline-offset-4 decoration-border-strong transition-colors hover:decoration-foreground";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-8">
      <p className="eyebrow text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-2 font-heading text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const STEPS: ReactNode[] = [
  <>
    Sign in at <ExternalLink href="https://app.devin.ai">app.devin.ai</ExternalLink>{" "}
    with the account you want the credits on.
  </>,
  <>
    Go to <ExternalLink href={PLANS_URL}>Settings → Plans</ExternalLink> and
    choose the plan your code is for.
  </>,
  <>Enter your code at checkout before you confirm.</>,
];

const SURFACES: {
  icon: LucideIcon;
  name: string;
  body: string;
  href: string;
  cta: string;
  command?: string;
}[] = [
  {
    icon: Cloud,
    name: "Devin",
    body: "The cloud agent. Hand it a task in the web app and it works in its own machine: writes and runs code, tests it, and opens a pull request.",
    href: "https://docs.devin.ai/get-started/devin-intro",
    cta: "Devin intro",
  },
  {
    icon: SquareTerminal,
    name: "Devin CLI",
    body: "A local agent in your terminal, working on your files. Run devin in a project folder; /handoff sends longer tasks to the cloud.",
    href: "https://docs.devin.ai/cli",
    cta: "CLI quickstart",
    command: CLI_INSTALL,
  },
  {
    icon: Monitor,
    name: "Devin Desktop",
    body: "An AI code editor for macOS, Windows and Linux, with the same agent built in.",
    href: "https://docs.devin.ai/desktop/getting-started",
    cta: "Install Desktop",
  },
];

const TIPS: ReactNode[] = [
  <>
    <strong className="font-medium text-foreground">Start in Ask mode.</strong>{" "}
    Plan the change with Devin first, then switch to Agent mode to build it.
  </>,
  <>
    <strong className="font-medium text-foreground">Say what done looks like.</strong>{" "}
    Clear completion criteria, like passing tests or a working page, give
    the best results.
  </>,
  <>
    <strong className="font-medium text-foreground">Keep tasks scoped.</strong>{" "}
    Split big projects into steps Devin can finish and you can check.
  </>,
];

const DOCS: { label: string; href: string }[] = [
  { label: "Your first session", href: "https://docs.devin.ai/get-started/first-run" },
  {
    label: "Instructing Devin effectively",
    href: "https://docs.devin.ai/essential-guidelines/instructing-devin-effectively",
  },
  { label: "When to use Devin", href: "https://docs.devin.ai/essential-guidelines/when-to-use-devin" },
  {
    label: "Testing and recordings",
    href: "https://docs.devin.ai/work-with-devin/testing-and-recordings",
  },
  { label: "Plans and usage", href: "https://docs.devin.ai/admin/billing/self-serve" },
  { label: "Release notes", href: "https://docs.devin.ai/release-notes/overview" },
];

export default function GetStartedPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <article className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          <header className="max-w-2xl">
            <p className="eyebrow text-muted-foreground">After you claim</p>
            <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Get started with Devin
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Apply your code, then pick where you want to work. Your codes are
              always in{" "}
              <Link href="/my-codes" className={linkClass}>
                My codes
              </Link>
              .
            </p>
          </header>

          <div className="mt-10 flex max-w-3xl flex-col gap-10">
            <Section eyebrow="Step 1" title="Apply your code">
              <ol className="flex flex-col gap-4">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-[11px] text-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                Already on a paid plan? Follow the redemption steps on your
                event&apos;s claim page; they cover existing subscriptions.
              </p>
              <a
                href={PLANS_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Open Plans
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </Section>

            <Section eyebrow="Step 2" title="Pick where you work">
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                Pro and Max usage covers all three.
              </p>
              <ul className="grid gap-4 sm:grid-cols-3">
                {SURFACES.map(({ icon: Icon, ...s }) => (
                  <li
                    key={s.name}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
                  >
                    <Icon className="size-5 text-muted-foreground" aria-hidden />
                    <h3 className="font-heading text-base font-semibold">{s.name}</h3>
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      {s.body}
                    </p>
                    {s.command ? <CopyCommand command={s.command} /> : null}
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex items-center gap-1 self-start text-sm font-medium text-foreground"
                    >
                      {s.cta}
                      <ArrowUpRight
                        className="size-3.5 text-muted-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                        aria-hidden
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </Section>

            <Section eyebrow="Tips" title="Get good results">
              <ul className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">
                {TIPS.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </Section>

            <Section eyebrow="Docs" title="Keep reading">
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {DOCS.map((doc) => (
                  <li key={doc.href} className="border-b border-border">
                    <a
                      href={doc.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center justify-between gap-3 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {doc.label}
                      <ArrowUpRight
                        className="size-3.5 shrink-0 text-muted-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                        aria-hidden
                      />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground">
                Questions about your account? Email{" "}
                <a href="mailto:support@cognition.ai" className={linkClass}>
                  support@cognition.ai
                </a>
                .
              </p>
            </Section>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
