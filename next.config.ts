import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    IS_DEVIN: process.env.IS_DEVIN || "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/",
        headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
      },
      {
        source: "/privacy",
        headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
      },
      {
        source: "/terms",
        headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
      },
      {
        source: "/my-codes/get-started",
        headers: [{ key: "X-Robots-Tag", value: "index, follow" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
