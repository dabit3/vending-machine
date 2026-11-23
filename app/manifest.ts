import type { MetadataRoute } from "next";
import { getAppName } from "@/lib/app-name";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: getAppName(),
    short_name: getAppName(),
    description: "Claim and manage credits for hackathons, conferences, and meetups.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My codes", url: "/my-codes", description: "View your claimed credits" },
    ],
  };
}
