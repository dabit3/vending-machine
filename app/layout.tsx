import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Credit Dispenser",
  description: "Claim credits for hackathons, conferences, and meetups.",
};

// Clerk v7 appearance variables, mapped to the app's design tokens.
const clerkAppearance: React.ComponentProps<typeof ClerkProvider>["appearance"] = {
  variables: {
    colorBackground: "#111111", // --surface
    colorForeground: "#f5f5f5", // --foreground
    colorMutedForeground: "#a3a3a3", // --muted-foreground
    colorMuted: "#161616", // --surface-hover
    colorInput: "#0a0a0a", // --background
    colorInputForeground: "#f5f5f5",
    colorBorder: "#262626", // --border
    colorNeutral: "#f5f5f5",
    colorPrimary: "#2200ff", // --brand
    colorPrimaryForeground: "#ffffff", // --brand-foreground
    colorRing: "#2200ff",
    colorModalBackdrop: "rgba(0, 0, 0, 0.73)",
    colorDanger: "#ff5f57",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
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
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
