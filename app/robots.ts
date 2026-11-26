import type { MetadataRoute } from "next";

// Allow crawlers to fetch event pages so they can read the `noindex`
// directives (X-Robots-Tag and meta robots) and exclude or de-index shared
// event links. Blocking `/<slug>` here would stop Google from seeing `noindex`,
// leaving externally linked URLs eligible to appear in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/sign-in", "/sign-up"],
    },
  };
}
