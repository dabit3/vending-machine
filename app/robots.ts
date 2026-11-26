import type { MetadataRoute } from "next";

// Event claim links live at top-level `/<slug>` paths, so allow only the
// public landing, legal, and getting-started routes and disallow everything
// else by default.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/privacy$", "/terms$", "/my-codes/get-started$"],
      disallow: "/",
    },
  };
}
