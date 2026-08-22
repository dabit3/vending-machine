import type { Metadata } from "next";
import { Manrope, Geist_Mono, Libre_Caslon_Text } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { getAppName } from "@/lib/app-name";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for headings and display type; the sans stays for body
// and UI chrome.
const libreCaslon = Libre_Caslon_Text({
  variable: "--font-libre-caslon",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: getAppName(),
  description: "Claim credits for hackathons, conferences, and meetups.",
};

// Clerk appearance: brand color + minimal overrides; Clerk adapts to the
// page background automatically.
const clerkAppearance: React.ComponentProps<typeof ClerkProvider>["appearance"] = {
  variables: {
    colorPrimary: "#8a3b2e",
    colorPrimaryForeground: "#ffffff",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-manrope), system-ui, sans-serif",
  },
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
  elements: {
    footer: "hidden",
    userButtonPopoverFooter: "hidden",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        className={`${manrope.variable} ${geistMono.variable} ${libreCaslon.variable} h-full overscroll-none antialiased`}
        suppressHydrationWarning
      >
        <body className="flex min-h-full flex-col overscroll-none">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <a
              href="#main-content"
              className="fixed top-3 left-3 z-50 -translate-y-20 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-transform focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Skip to content
            </a>
            <ConvexClientProvider>{children}</ConvexClientProvider>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
